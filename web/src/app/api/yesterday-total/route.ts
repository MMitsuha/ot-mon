import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const deviceIp = searchParams.get("device");
  const startStr = searchParams.get("start");
  const endStr = searchParams.get("end");

  const start = startStr ? new Date(startStr) : null;
  const end = endStr ? new Date(endStr) : null;
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: "missing or invalid start/end" },
      { status: 400 },
    );
  }

  const matchStage: Record<string, unknown> = {
    timestamp: { $gte: start, $lt: end },
  };
  if (deviceIp) {
    matchStage.device_ip = deviceIp;
  }

  const db = await getDb();
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
        $setWindowFields: {
          sortBy: { timestamp: 1 },
          output: {
            nextTs: { $shift: { output: "$timestamp", by: 1, default: null } },
          },
        },
      },
      {
        $addFields: {
          // Cap delta at 120s so a polling gap doesn't get attributed
          // to whatever speed happened to be sampled before it.
          deltaSec: {
            $cond: [
              { $eq: ["$nextTs", null] },
              60,
              {
                $min: [
                  120,
                  {
                    $divide: [
                      { $subtract: ["$nextTs", "$timestamp"] },
                      1000,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          downBytes: { $sum: { $multiply: ["$totalDown", "$deltaSec"] } },
          upBytes: { $sum: { $multiply: ["$totalUp", "$deltaSec"] } },
          sampleCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          downBytes: { $round: ["$downBytes", 0] },
          upBytes: { $round: ["$upBytes", 0] },
          sampleCount: 1,
        },
      },
    ])
    .toArray();

  const data = results[0] ?? { downBytes: 0, upBytes: 0, sampleCount: 0 };
  return NextResponse.json(data);
}
