// Vercel Function behind every /api/* request (see the rewrite in vercel.json).
import { getApp } from '../server/deps.mjs';
import { handleRequest } from '../server/http.mjs';

export const GET = req => handleRequest(req, getApp);
export const POST = req => handleRequest(req, getApp);
