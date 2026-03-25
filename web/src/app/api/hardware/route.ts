import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getInterval } from "@/lib/api";

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
          // use current usage
          cpuUsage: {
            $toDouble: {
              $ifNull: [{ $arrayElemAt: ["$cpu.usage", 0] }, 0],
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
          // io[0] = current, io[1] = peak hour
          _ioDevices: {
            $objectToArray: {
              $ifNull: [{ $arrayElemAt: ["$io", 0] }, {}],
            },
          },
          _ioPeakDevices: {
            $objectToArray: {
              $ifNull: [{ $arrayElemAt: ["$io", 1] }, {}],
            },
          },
        },
      },
      {
        $addFields: {
          ioMaxUtil: {
            $max: {
              $map: {
                input: "$_ioDevices",
                as: "d",
                in: { $toDouble: { $ifNull: ["$$d.v.util", "0"] } },
              },
            },
          },
          ioTotalRead: {
            $sum: {
              $map: {
                input: "$_ioDevices",
                as: "d",
                in: { $toDouble: { $ifNull: ["$$d.v.rkbs", "0"] } },
              },
            },
          },
          ioTotalWrite: {
            $sum: {
              $map: {
                input: "$_ioDevices",
                as: "d",
                in: { $toDouble: { $ifNull: ["$$d.v.wkbs", "0"] } },
              },
            },
          },
          ioPeakMaxUtil: {
            $max: {
              $map: {
                input: "$_ioPeakDevices",
                as: "d",
                in: { $toDouble: { $ifNull: ["$$d.v.util", "0"] } },
              },
            },
          },
          ioPeakTotalRead: {
            $sum: {
              $map: {
                input: "$_ioPeakDevices",
                as: "d",
                in: { $toDouble: { $ifNull: ["$$d.v.rkbs", "0"] } },
              },
            },
          },
          ioPeakTotalWrite: {
            $sum: {
              $map: {
                input: "$_ioPeakDevices",
                as: "d",
                in: { $toDouble: { $ifNull: ["$$d.v.wkbs", "0"] } },
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
          ioMaxUtil: { $avg: "$ioMaxUtil" },
          ioTotalRead: { $avg: "$ioTotalRead" },
          ioTotalWrite: { $avg: "$ioTotalWrite" },
          ioPeakMaxUtil: { $last: "$ioPeakMaxUtil" },
          ioPeakTotalRead: { $last: "$ioPeakTotalRead" },
          ioPeakTotalWrite: { $last: "$ioPeakTotalWrite" },
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
          ioMaxUtil: { $round: [{ $ifNull: ["$ioMaxUtil", 0] }, 1] },
          ioTotalReadKbs: { $round: [{ $ifNull: ["$ioTotalRead", 0] }, 0] },
          ioTotalWriteKbs: { $round: [{ $ifNull: ["$ioTotalWrite", 0] }, 0] },
          ioPeakMaxUtil: {
            $round: [{ $ifNull: ["$ioPeakMaxUtil", 0] }, 1],
          },
          ioPeakTotalReadKbs: {
            $round: [{ $ifNull: ["$ioPeakTotalRead", 0] }, 0],
          },
          ioPeakTotalWriteKbs: {
            $round: [{ $ifNull: ["$ioPeakTotalWrite", 0] }, 0],
          },
        },
      },
    ])
    .toArray();

  return NextResponse.json(results);
}
