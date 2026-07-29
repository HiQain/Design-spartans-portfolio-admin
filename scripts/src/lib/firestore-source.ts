/**
 * Minimal Firestore REST reader for the one-off migration script. Mirrors the
 * approach already proven in designspartans-porfolio/lib/firestore-rest.ts:
 * Firestore's security rules already allow public unauthenticated reads on
 * these collections (that's how the live portfolio site works for visitors),
 * so no service-account credentials are needed here either.
 */
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID ?? "designspartans-portfolio";
const API_KEY = process.env.FIRESTORE_API_KEY ?? "AIzaSyC8ixThMuTncx0LWw4kVFtJ4nOeTmq2iGc";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

type FirestoreValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  referenceValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDoc = {
  name: string;
  fields?: Record<string, FirestoreValue>;
};

function decodeValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("timestampValue" in value) return value.timestampValue ? Date.parse(value.timestampValue) : 0;
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue?.fields);
  return undefined;
}

function decodeFields(fields: Record<string, FirestoreValue> | undefined): Record<string, unknown> {
  if (!fields) return {};
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeDoc<T>(doc: FirestoreDoc): T {
  const id = doc.name.split("/").pop() as string;
  return { ...decodeFields(doc.fields), id } as T;
}

export async function fetchCollection<T>(collectionId: string): Promise<T[]> {
  const results: FirestoreDoc[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${BASE_URL}/${collectionId}`);
    url.searchParams.set("key", API_KEY);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Firestore REST list "${collectionId}" failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { documents?: FirestoreDoc[]; nextPageToken?: string };
    results.push(...(data.documents ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results.map((doc) => decodeDoc<T>(doc));
}

export async function fetchDocument<T>(collectionId: string, docId: string): Promise<T | null> {
  const url = `${BASE_URL}/${collectionId}/${docId}?key=${API_KEY}`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore REST get "${collectionId}/${docId}" failed: ${response.status}`);
  return decodeDoc<T>((await response.json()) as FirestoreDoc);
}
