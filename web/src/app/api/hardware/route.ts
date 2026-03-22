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
    .collection("hardware_status")
    .aggregate([
      { $match: matchStage },
      {
        $addFields: {
          cpuUsage: {
            $avg: {
              $map: {
                input: "$cpu",
                as: "c",
                in: { $toDouble: "$$c.usage" },
              },
            },
          },
          memTotal: { $arrayElemAt: ["$mem.total", 0] },
          memFree: { $arrayElemAt: ["$mem.available", 0] },
          diskTotal: {
            $sum: {
              $map: {
                input: { $ifNull: ["$disk.disk_info", []] },
                as: "d",
                in: "$$d.total",
              },
            },
          },
          diskUsed: {
            $sum: {
              $map: {
                input: { $ifNull: ["$disk.disk_info", []] },
                as: "d",
                in: "$$d.used",
              },
            },
          },
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
          cpuUsage: { $avg: "$cpuUsage" },
          memTotal: { $last: "$memTotal" },
          memFree: { $avg: "$memFree" },
          diskTotal: { $last: "$diskTotal" },
          diskUsed: { $last: "$diskUsed" },
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
          cpuUsage: { $round: ["$cpuUsage", 1] },
          memTotal: 1,
          memUsed: {
            $round: [{ $subtract: ["$memTotal", "$memFree"] }, 0],
          },
          memUsedPercent: {
            $round: [
              {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ["$memTotal", "$memFree"] },
                      { $max: ["$memTotal", 1] },
                    ],
                  },
                  100,
                ],
              },
              1,
            ],
          },
          diskTotal: 1,
          diskUsed: 1,
          diskUsedPercent: {
            $round: [
              {
                $multiply: [
                  {
                    $divide: [
                      "$diskUsed",
                      { $max: ["$diskTotal", 1] },
                    ],
                  },
                  100,
                ],
              },
              1,
            ],
          },
        },
      },
    ])
    .toArray();

  return NextResponse.json(results);
}
