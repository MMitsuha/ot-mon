import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const db = await getDb();
  const devices = await db
    .collection("pppoe_status")
    .aggregate([
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$device_ip",
          device_name: { $first: "$device_name" },
        },
      },
    ])
    .toArray();

  return NextResponse.json(
    devices.map((d) => ({
      device_ip: d._id,
      device_name: d.device_name,
    })),
  );
}
