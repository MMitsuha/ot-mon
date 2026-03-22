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
      // Expand per-disk
      { $unwind: "$disk.disk_info" },
      // Skip system disks
      { $match: { "disk.disk_info.system_disk": { $ne: true } } },
      // Match io[0] entry by SN
      {
        $addFields: {
          _diskSn: "$disk.disk_info.sn",
          _ioMatch: {
            $arrayElemAt: [
              {
                $filter: {
                  input: {
                    $objectToArray: {
                      $ifNull: [{ $arrayElemAt: ["$io", 0] }, {}],
                    },
                  },
                  as: "kv",
                  cond: { $eq: ["$$kv.v.sn", "$disk.disk_info.sn"] },
                },
              },
              0,
            ],
          },
        },
      },
      // Group by time bucket + SN
      {
        $group: {
          _id: {
            bucket: {
              $dateTrunc: {
                date: "$timestamp",
                unit: "minute",
                binSize: intervalMinutes,
              },
            },
            sn: "$_diskSn",
          },
          diskType: { $last: "$disk.disk_info.disk_type" },
          total: { $last: "$disk.disk_info.total" },
          used: { $last: "$disk.disk_info.used" },
          rkbs: {
            $avg: {
              $toDouble: { $ifNull: ["$_ioMatch.v.rkbs", "0"] },
            },
          },
          wkbs: {
            $avg: {
              $toDouble: { $ifNull: ["$_ioMatch.v.wkbs", "0"] },
            },
          },
          rAwait: {
            $avg: {
              $toDouble: { $ifNull: ["$_ioMatch.v.r_await", "0"] },
            },
          },
          wAwait: {
            $avg: {
              $toDouble: { $ifNull: ["$_ioMatch.v.w_await", "0"] },
            },
          },
          svctm: {
            $avg: {
              $toDouble: { $ifNull: ["$_ioMatch.v.svctm", "0"] },
            },
          },
          util: {
            $avg: {
              $toDouble: { $ifNull: ["$_ioMatch.v.util", "0"] },
            },
          },
        },
      },
      { $sort: { "_id.bucket": 1 } },
      {
        $project: {
          _id: 0,
          timestamp: {
            $dateToString: {
              format: "%Y-%m-%dT%H:%M:%S.000Z",
              date: "$_id.bucket",
            },
          },
          sn: "$_id.sn",
          diskType: 1,
          total: 1,
          used: 1,
          rkbs: { $round: ["$rkbs", 1] },
          wkbs: { $round: ["$wkbs", 1] },
          rAwait: { $round: ["$rAwait", 1] },
          wAwait: { $round: ["$wAwait", 1] },
          svctm: { $round: ["$svctm", 1] },
          util: { $round: ["$util", 1] },
        },
      },
      // Re-group by SN to produce one array per disk
      {
        $group: {
          _id: "$sn",
          diskType: { $last: "$diskType" },
          total: { $last: "$total" },
          data: { $push: "$$ROOT" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          sn: "$_id",
          diskType: 1,
          total: 1,
          data: 1,
        },
      },
    ])
    .toArray();

  return NextResponse.json(results);
}
