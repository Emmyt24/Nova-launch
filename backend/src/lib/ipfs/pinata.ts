import pinataSDK from "@pinata/sdk";
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

export async function uploadImageToIPFS(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const pinata = new pinataSDK(
    process.env.PINATA_API_KEY!,
    process.env.PINATA_API_SECRET!
  );

  const result = await pinata.pinFileToIPFS(buffer, {
    pinataMetadata: { name: filename },
  });

  return result.IpfsHash;
}

export async function uploadMetadataToIPFS(metadata: any): Promise<string> {
  const pinata = new pinataSDK(
    process.env.PINATA_API_KEY!,
    process.env.PINATA_API_SECRET!
  );

  const result = await pinata.pinJSONToIPFS(metadata);
  const cid = result.IpfsHash;

  // Cache the metadata
  cache.set(cid, metadata);

  return cid;
}

export async function getMetadataFromIPFS(cid: string): Promise<any> {
  // Check cache first
  const cached = cache.get(cid);
  if (cached) return cached;

  // Fetch from IPFS
  const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
  if (!response.ok) throw new Error("Metadata not found");

  const metadata = await response.json();
  cache.set(cid, metadata);

  return metadata;
}
