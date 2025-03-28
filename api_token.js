// api_token.js
// Try importing dotenv, but don't fail if it's not available
let dotenv;
try {
  dotenv = await import('dotenv');
  // Load environment variables from .env file if dotenv is available
  dotenv.default.config();
} catch (error) {
  console.log('Warning: dotenv module not found, using environment variables directly');
}

// Default values in case environment variables are not set
const DEFAULT_AUTH_HEADER = 'Bearer your-default-token-here';
const DEFAULT_BASE_URL = 'https://api.example.com';

// Get the auth header from environment variables, with fallback
export const authHeader = process.env.CERBO_API_AUTH_HEADER || DEFAULT_AUTH_HEADER;

// Export the base URL for the Cerbo API, with fallback
export const baseUrl = process.env.CERBO_API_BASE_URL || DEFAULT_BASE_URL;