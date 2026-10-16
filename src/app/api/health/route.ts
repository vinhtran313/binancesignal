/**
 * API: Health check endpoint
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
}
