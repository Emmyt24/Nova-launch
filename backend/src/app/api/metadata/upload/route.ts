import { NextRequest, NextResponse } from "next/server";
import { uploadImageToIPFS, uploadMetadataToIPFS } from "@/lib/ipfs/pinata";
import {
  validateImageFile,
  validateMetadata,
} from "@/lib/validation/validator";
import type { UploadResponse } from "@/types/metadata";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Extract fields
    const name = formData.get("name") as string;
    const symbol = formData.get("symbol") as string;
    const description = (formData.get("description") as string) || "";
    const decimals = parseInt(formData.get("decimals") as string);
    const imageFile = formData.get("image") as File | null;
    const properties = formData.get("properties") as string;

    // Validate metadata format
    const metadataValidation = validateMetadata({ name, symbol, decimals });
    if (!metadataValidation.valid) {
      return NextResponse.json(
        { success: false, error: metadataValidation.error },
        { status: 400 }
      );
    }

    let imageCID = "";

    // Upload image to IPFS if provided
    if (imageFile) {
      const imageValidation = validateImageFile(imageFile);
      if (!imageValidation.valid) {
        return NextResponse.json(
          { success: false, error: imageValidation.error },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await imageFile.arrayBuffer());
      imageCID = await uploadImageToIPFS(buffer, imageFile.name);
    }

    // Generate metadata JSON
    const metadata = {
      name,
      symbol,
      description,
      image: imageCID ? `ipfs://${imageCID}` : "",
      decimals,
      properties: properties ? JSON.parse(properties) : {},
    };

    // Pin metadata to IPFS
    const metadataCID = await uploadMetadataToIPFS(metadata);

    const response: UploadResponse = {
      success: true,
      cid: metadataCID,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: "Upload failed" },
      { status: 500 }
    );
  }
}
