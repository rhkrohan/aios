// Real contents of files you import from your computer. Kept in memory for
// this browser tab (object URLs for previews, text for anything readable).
// Not saved across reloads in this preview.

export interface Blobish {
  url: string;
  text?: string;
  mime: string;
}

const store = new Map<string, Blobish>();

export const getBlob = (id: string) => store.get(id);
export const putBlob = (id: string, b: Blobish) => store.set(id, b);
