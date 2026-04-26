export interface DialStatusDoc {
  tag: string;
  status: string;
  username: string;
  ipaddr: string;
  macaddr: string;
  nic: string;
  lineid: number;
  downspeed: number;
  upspeed: number;
  errcode: number;
  errmsg: string;
  proto: string;
}

export interface PppoeStatusDoc {
  device_ip: string;
  device_name: string;
  timestamp: Date;
  connectedline: number;
  totalline: number;
  multidial: DialStatusDoc[];
}

export interface SpeedDataPoint {
  timestamp: string;
  totalDownSpeed: number;
  totalUpSpeed: number;
  connectedLine: number;
  totalLine: number;
}

export interface DeviceInfo {
  device_ip: string;
  device_name: string;
}

export interface HardwareDataPoint {
  timestamp: string;
  cpuUsage: number;
  memUsedPercent: number;
  memTotal: number;
  memUsed: number;
  diskUsedPercent: number;
  diskTotal: number;
  diskUsed: number;
  ioMaxUtil: number;
  ioTotalReadKbs: number;
  ioTotalWriteKbs: number;
  ioPeakMaxUtil: number;
  ioPeakTotalReadKbs: number;
  ioPeakTotalWriteKbs: number;
}

export interface DiskDataPoint {
  timestamp: string;
  sn: string;
  total: number;
  used: number;
  rkbs: number;
  wkbs: number;
  rAwait: number;
  wAwait: number;
  svctm: number;
  util: number;
}

export interface PerDiskSeries {
  sn: string;
  diskType: string;
  total: number;
  data: DiskDataPoint[];
}

export interface YesterdayTotal {
  downBytes: number;
  upBytes: number;
  sampleCount: number;
}
