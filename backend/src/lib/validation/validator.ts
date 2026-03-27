const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function validateImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "File size exceeds 5MB limit" };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP",
    };
  }

  return { valid: true };
}

export function validateMetadata(data: any): {
  valid: boolean;
  error?: string;
} {
  if (!data.name || typeof data.name !== "string") {
    return { valid: false, error: "Name is required" };
  }

  if (!data.symbol || typeof data.symbol !== "string") {
    return { valid: false, error: "Symbol is required" };
  }

  if (data.decimals === undefined || typeof data.decimals !== "number") {
    return { valid: false, error: "Decimals is required and must be a number" };
  }

  return { valid: true };
}
