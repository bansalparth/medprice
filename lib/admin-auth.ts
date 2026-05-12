import { NextRequest, NextResponse } from "next/server";

export function checkAdmin(req: NextRequest): NextResponse | null {
  const user = req.headers.get("x-admin-user");
  const password = req.headers.get("x-admin-password");

  if (!user || user !== process.env.ADMIN_USER) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
