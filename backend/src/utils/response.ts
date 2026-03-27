export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function errorResponse(error: {
  code: string;
  message: string;
  details?: any;
}): ApiResponse<null> {
  return {
    success: false,
    error,
    timestamp: new Date().toISOString(),
  };
}
