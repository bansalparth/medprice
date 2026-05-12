import { NextRequest, NextResponse } from "next/server";

export function checkAdmin(req: NextRequest): NextResponse | null {
  const auth = req.headers.get("x-admin-password");
  if (!auth || auth !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
