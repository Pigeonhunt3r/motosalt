#!/usr/bin/env python3
"""Build a self-contained ARM64 Android APK with pinned, verified local tools.
The generated Expo development keystore signs this installable test build.
Store distribution needs the owner's release signing key instead.
"""
import hashlib
import os
from pathlib import Path
import shutil
import sys
import subprocess
import tarfile
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT.parent / '.cache' / 'motosalt-android'
CACHE.mkdir(parents=True, exist_ok=True)

def download(url, name, digest):
    target = CACHE / name
    if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        print('Downloading verified build tool:', name, flush=True)
        urllib.request.urlretrieve(url, target)
    if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise RuntimeError('SHA256 mismatch: ' + name)
    return target

def jdk(version, release, suffix, digest, folder):
    url = f'https://github.com/adoptium/temurin{version}-binaries/releases/download/jdk-{release}/OpenJDK{version}U-jdk_x64_linux_hotspot_{suffix}.tar.gz'
    archive = download(url, f'jdk{version}.tar.gz', digest)
    destination = CACHE / folder
    if not destination.exists():
        destination.mkdir()
        with tarfile.open(archive) as source:
            source.extractall(destination, filter='data')
    return next(destination.glob('jdk-*'))

j21 = jdk(21, '21.0.13%2B9', '21.0.13_9', 'd7f5d5cf865a2902b70ff549b97586a7d3f234e016f041ab447ea740c7d66d1c', 'jdk')
j17 = jdk(17, '17.0.17%2B10', '17.0.17_10', '992f96e7995075ac7636bb1a8de52b0c61d71ed3137fafc979ab96b4ab78dd75', 'jdk17')
sdk = CACHE / 'sdk'
tools = sdk / 'cmdline-tools' / '19.0'
if not tools.exists():
    archive = download('https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip', 'commandlinetools-19.zip', '7ec965280a073311c339e571cd5de778b9975026cfcbe79f2b1cdcb1e15317ee')
    staging = CACHE / 'tools-extract'
    with zipfile.ZipFile(archive) as source:
        source.extractall(staging)
    tools.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(staging / 'cmdline-tools', tools)
    for executable in (tools / 'bin').iterdir():
        executable.chmod(0o755)
env = os.environ.copy()
env.update(JAVA_HOME=str(j21), ANDROID_HOME=str(sdk), ANDROID_SDK_ROOT=str(sdk), ANDROID_USER_HOME=str(CACHE / 'user'), GRADLE_USER_HOME=str(CACHE / 'gradle'), EXPO_NO_TELEMETRY='1', EXPO_OFFLINE='1', CI='1')
Path(env['ANDROID_USER_HOME']).mkdir(exist_ok=True)
# Reuse this machine's existing Java CA store and normal proxy, without modifying trust stores.
java_options = env.get('JAVA_TOOL_OPTIONS', '')
if Path('/etc/ssl/certs/java/cacerts').exists():
    java_options += ' -Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts'
proxy = urllib.parse.urlparse(env.get('HTTPS_PROXY', ''))
if proxy.hostname:
    java_options += f' -Dhttps.proxyHost={proxy.hostname} -Dhttps.proxyPort={proxy.port or 80} -Dhttp.proxyHost={proxy.hostname} -Dhttp.proxyPort={proxy.port or 80} -Dhttp.nonProxyHosts=localhost|127.*'
env['JAVA_TOOL_OPTIONS'] = java_options.strip()
manager = str(tools / 'bin' / 'sdkmanager')
packages = {'platform-tools':'platform-tools', 'platforms/android-37.0':'platforms;android-37.0', 'build-tools/37.0.0':'build-tools;37.0.0', 'ndk/27.1.12297006':'ndk;27.1.12297006', 'cmake/3.22.1':'cmake;3.22.1'}
missing = [name for directory, name in packages.items() if not (sdk / directory).exists()]
if missing:
    with (CACHE / 'sdk-install.log').open('w') as log:
        subprocess.run([manager, '--sdk_root=' + str(sdk), '--licenses'], input='y\n'*100, text=True, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
        subprocess.run([manager, '--sdk_root=' + str(sdk), *missing], input='y\n'*100, text=True, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
template = download('https://registry.npmjs.org/expo-template-bare-minimum/-/expo-template-bare-minimum-58.0.28.tgz', 'expo-template-bare-minimum-58.0.28.tgz', 'fd958ca9b434d114ccc70c010d5404b537d49cd6ff09e239c917793ef4872991')
if '--reuse-native' not in sys.argv:
    subprocess.run(['npx', '--no-install', 'expo', 'prebuild', '--platform', 'android', '--no-install', '--template', str(template)], cwd=ROOT, env=env, check=True)
wrapper = ROOT / 'android/gradle/wrapper/gradle-wrapper.properties'
text = wrapper.read_text()
if 'distributionSha256Sum=' not in text:
    wrapper.write_text(text + '\ndistributionSha256Sum=2ab2958f2a1e51120c326cad6f385153bb11ee93b3c216c5fccebfdfbb7ec6cb\n')
# Gradle verifies its downloaded distribution against the official SHA256.
with (CACHE / 'gradle-build.log').open('w') as log:
    subprocess.run(['./gradlew', ':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a', f'-Porg.gradle.java.installations.paths={j17},{j21}', '--max-workers=3', '--console=plain', '-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g'], cwd=ROOT / 'android', env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
output = ROOT / 'artifacts'
output.mkdir(exist_ok=True)
apk = output / 'motosalt-0.3.0-android-arm64.apk'
shutil.copyfile(ROOT / 'android/app/build/outputs/apk/release/app-release.apk', apk)
(output / (apk.name + '.sha256')).write_text(hashlib.sha256(apk.read_bytes()).hexdigest() + '  ' + apk.name + '\n')
print('APK ready:', apk)
