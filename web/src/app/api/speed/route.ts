import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

function getInterval(hours: number): number {
  if (hours <= 1) return 1;
  if (hours <= 6) return 2;
  if (hours <= 24) return 5;
  if (hours <= 168) return 30;
  return 60;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const deviceIp = searchParams.get("device");
  const hours = parseInt(searchParams.get("hours") || "24");
  const intervalMinutes = getInterval(hours);

  const db = await getDb();
  const startDate = new Date(Date.now() - hours * 3600 * 1000);

  const matchStage: Record<string, unknown> = {
    timestamp: { $gte: startDate },
  };
  if (deviceIp) {
    matchStage.device_ip = deviceIp;
  }

  const results = await db
    .collection("pppoe_status")
    .aggregate([
      { $match: matchStage },
      {
        $addFields: {
          totalDown: { $sum: "$multidial.downspeed" },
          totalUp: { $sum: "$multidial.upspeed" },
        },
      },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: "$timestamp",
              unit: "minute",
              binSize: intervalMinutes,
            },
          },
          avgDown: { $avg: "$totalDown" },
          avgUp: { $avg: "$totalUp" },
          connectedLine: { $last: "$connectedline" },
          totalLine: { $last: "$totalline" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          timestamp: {
            $dateToString: {
              format: "%Y-%m-%dT%H:%M:%S.000Z",
              date: "$_id",
            },
          },
          totalDownSpeed: { $round: ["$avgDown", 0] },
          totalUpSpeed: { $round: ["$avgUp", 0] },
          connectedLine: 1,
          totalLine: 1,
        },
      },
    ])
    .toArray();

  return NextResponse.json(results);
}
