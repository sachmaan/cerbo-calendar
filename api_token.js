// api_token.js
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get the auth header from environment variables
export const authHeader = process.env.CERBO_API_AUTH_HEADER;

// Export the base URL for the Cerbo API
export const baseUrl = process.env.CERBO_API_BASE_URL;