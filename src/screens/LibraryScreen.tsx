import { useState } from "react";
import type { SavedTrip } from "../core/models";
import { Badge, Body, Button, Card, Eyebrow, Hint, Page, Title } from "../ui";
import { duration, formatDate } from "../format";
export default function LibraryScreen({
  trips,
  onOpen,
  onDelete,
  onPlan,
}: {
  trips: SavedTrip[];
  onOpen: (trip: SavedTrip) => void;
  onDelete: (id: string) => void;
  onPlan: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  return (
    <Page>
      <Eyebrow>DINE VEJE, GEMT TIL SENERE</Eyebrow>
      <Title>Den næste tur{"\n"}ligger klar.</Title>
      <Body muted>
        Op til 30 ture på denne enhed. Kortfelter og opdaterede data kræver
        netværk.
      </Body>
      {!trips.length && (
        <Card>
          <Body>Du har endnu ikke gemt en tur.</Body>
          <Button label="Planlæg din første tur" onPress={onPlan} />
        </Card>
      )}
      {trips.map((trip) => (
        <Card key={trip.route.id}>
          <Badge label="Valhalla · rigtigt vejnet" />
          <Title>{trip.route.name}</Title>
          <Body>
            {trip.route.distanceKm} km · {duration(trip.route.minutes)}
          </Body>
          <Hint>
            Gemt {formatDate(trip.savedAt)}. Vejr er et øjebliksbillede,
            saltstatus kan være ukendt.
          </Hint>
          <Button
            label={`Åbn ${trip.route.name}`}
            onPress={() => onOpen(trip)}
          />
          {deleting === trip.route.id ? (
            <>
              <Body>Slet turen fra denne enhed?</Body>
              <Button
                label="Ja, slet turen"
                secondary
                onPress={() => {
                  onDelete(trip.route.id);
                  setDeleting(null);
                }}
              />
              <Button
                label="Behold turen"
                secondary
                onPress={() => setDeleting(null)}
              />
            </>
          ) : (
            <Button
              label={`Slet ${trip.route.name}`}
              secondary
              onPress={() => setDeleting(trip.route.id)}
            />
          )}
        </Card>
      ))}
    </Page>
  );
}
