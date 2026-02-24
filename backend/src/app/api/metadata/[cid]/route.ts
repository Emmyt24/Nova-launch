import { NextRequest, NextResponse } from "next/server";
import { getMetadataFromIPFS } from "@/lib/ipfs/pinata";
import type { MetadataResponse } from "@/types/metadata";

export async function GET(
  request: NextRequest,
  { params }: { params: { cid: string } }
) {
  try {
    const { cid } = params;

    if (!cid) {
      return NextResponse.json(
        { success: false, error: "CID is required" },
        { status: 400 }
      );
    }

    // Retrieve metadata JSON from IPFS (with caching)
    const metadata = await getMetadataFromIPFS(cid);

    const response: MetadataResponse = {
      success: true,
      data: metadata,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Retrieve error:", error);
    return NextResponse.json(
      { success: false, error: "Metadata not found" },
      { status: 404 }
    );
  }
}
