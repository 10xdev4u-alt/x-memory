import { deleteCollection, type Collection } from "./collections.js";
import { canPublish } from "./visibility.js";

export interface HostedApiOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function publishCollection(collection: Collection, options: HostedApiOptions): Promise<"published" | "private"> {
  if (!(await canPublish("collection", collection.id))) return "private";
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const response = await (options.fetchImpl ?? fetch)(`${baseUrl}/v1/collections/${encodeURIComponent(collection.id)}`, {
    body: JSON.stringify(collection),
    credentials: "omit",
    headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
    method: "PUT",
  });
  if (!response.ok) throw new Error(`publish failed: ${response.status}`);
  return "published";
}

export async function deletePublishedCollection(id: string, options: HostedApiOptions): Promise<boolean> {
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const response = await (options.fetchImpl ?? fetch)(`${baseUrl}/v1/collections/${encodeURIComponent(id)}`, {
    credentials: "omit",
    headers: { authorization: `Bearer ${options.apiKey}` },
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) throw new Error(`delete failed: ${response.status}`);
  await deleteCollection(id);
  return response.status !== 404;
}
