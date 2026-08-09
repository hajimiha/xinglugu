import { npcs } from './data'
import { FESTIVAL_SEED_OFFERS } from './economy'
import type { Festival, LocationId, NpcDailySchedule, ScheduleSegment, Season } from './types'

export const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const
export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const
export const MAX_GAME_YEAR = 9999

export interface CalendarDate {
  year: number
  dayOfYear: number
  month: number
  date: number
  season: Season
  weekday: string
}

export interface NpcPresence extends ScheduleSegment {
  npcId: string
  festivalId?: string
}

const clampInteger = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, Math.floor(Number.isFinite(value) ? value : minimum)))
)

export function getDayOfYear(month: number, date: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('月份必须在1至12之间。')
  const monthLength = MONTH_LENGTHS[month - 1]
  if (!Number.isInteger(date) || date < 1 || date > monthLength) throw new RangeError('日期超出该月范围。')
  return MONTH_LENGTHS.slice(0, month - 1).reduce((sum, length) => sum + length, 0) + date
}

function getMonthAndDate(day: number): { month: number; date: number } {
  let remaining = clampInteger(day, 1, 365)
  for (let index = 0; index < MONTH_LENGTHS.length; index += 1) {
    if (remaining <= MONTH_LENGTHS[index]) return { month: index + 1, date: remaining }
    remaining -= MONTH_LENGTHS[index]
  }
  return { month: 12, date: 31 }
}

export function getSeasonForDay(day: number): Season {
  const { month } = getMonthAndDate(day)
  if (month <= 3) return '春'
  if (month <= 6) return '夏'
  if (month <= 9) return '秋'
  return '冬'
}

function getWeekdayIndex(year: number, day: number): number {
  const safeYear = clampInteger(year, 1, MAX_GAME_YEAR)
  const safeDay = clampInteger(day, 1, 365)
  return ((safeYear - 1) * 365 + safeDay - 1) % WEEKDAYS.length
}

export function getWeekday(year: number, day: number): string {
  return WEEKDAYS[getWeekdayIndex(year, day)]
}

export function getCalendarDate(year: number, day: number): CalendarDate {
  const safeYear = clampInteger(year, 1, MAX_GAME_YEAR)
  const dayOfYear = clampInteger(day, 1, 365)
  const { month, date } = getMonthAndDate(dayOfYear)
  return {
    year: safeYear,
    dayOfYear,
    month,
    date,
    season: getSeasonForDay(dayOfYear),
    weekday: getWeekday(safeYear, dayOfYear),
  }
}

export function advanceCalendarClock(year: number, day: number, minutes: number, elapsedMinutes: number) {
  const safeYear = clampInteger(year, 1, MAX_GAME_YEAR)
  const safeDay = clampInteger(day, 1, 365)
  const safeMinutes = clampInteger(minutes, 0, 1439)
  const elapsed = Math.floor(Number.isFinite(elapsedMinutes) ? Math.max(0, elapsedMinutes) : 0)
  const currentAbsoluteMinute = (((safeYear - 1) * 365 + safeDay - 1) * 1440) + safeMinutes
  const maximumAbsoluteMinute = MAX_GAME_YEAR * 365 * 1440 - 1
  const targetAbsoluteMinute = Math.min(maximumAbsoluteMinute, currentAbsoluteMinute + elapsed)
  const absoluteDay = Math.floor(targetAbsoluteMinute / 1440)
  return {
    year: Math.floor(absoluteDay / 365) + 1,
    day: absoluteDay % 365 + 1,
    minutes: targetAbsoluteMinute % 1440,
  }
}

export function formatGameDate(year: number, day: number): string {
  const calendar = getCalendarDate(year, day)
  return `第${calendar.year}年${calendar.month}月${calendar.date}日`
}

const eventActivity = (id: string, name: string, description: string, startMinute: number, endMinute: number) => ({
  id, name, description, startMinute, endMinute,
})

export const festivals: Festival[] = [
  {
    id: 'first-light-festival', name: '迎岁灯会', month: 1, date: 12, locationId: 'mayor-home', startMinute: 17 * 60, endMinute: 22 * 60,
    participantIds: ['loran', 'freya', 'mina', 'liuan', 'taomi'],
    description: '全村把写有新年愿望的苔纸灯挂上壁炉长廊。',
    activities: [eventActivity('first-light-vow', '点灯祈愿', '写下今年最想完成的一件事并点亮苔纸灯。', 17 * 60, 18 * 60 + 30), eventActivity('first-light-seeds', '春种祝福', '芙蕾雅为新手种子做春季祝福。', 18 * 60 + 30, 20 * 60), eventActivity('first-light-supper', '壁炉共餐', '与村民围桌分享迎岁炖汤。', 20 * 60, 22 * 60)],
  },
  {
    id: 'tide-song-festival', name: '潮信祭', month: 2, date: 18, locationId: 'fisher-home', startMinute: 6 * 60, endMinute: 14 * 60,
    participantIds: ['chaoyin', 'xiye', 'mina', 'weina'], description: '潮音依照第一道春潮校准全年的航路与渔期。',
    activities: [eventActivity('tide-listen', '听潮识向', '跟随汐野辨认三种回潮声。', 6 * 60, 8 * 60), eventActivity('tide-race', '银鳞垂钓赛', '在限定潮段内争取最漂亮的银鳞鲫。', 8 * 60, 11 * 60), eventActivity('tide-map', '新航路落笔', '把今年第一次潮线绘入村庄海图。', 11 * 60, 14 * 60)],
  },
  {
    id: 'sowing-festival', name: '播种祭', month: 3, date: 20, locationId: 'farm', startMinute: 8 * 60, endMinute: 17 * 60,
    participantIds: ['freya', 'liuan', 'mira', 'qiluo', 'loran'], description: '农人、商户与育种师在南坡交换春末种法。',
    activities: [eventActivity('sowing-exchange', '种子交换', '用多余种子换取不同作物的试种包。', 8 * 60, 10 * 60), eventActivity('sowing-lines', '齐垄竞速', '在旧石墙旁完成整齐的示范田垄。', 10 * 60, 13 * 60), eventActivity('sowing-judging', '新芽评选', '由芙蕾雅和米菈评选最健康的新芽。', 14 * 60, 17 * 60)],
  },
  {
    id: 'forest-bell-festival', name: '林铃花会', month: 4, date: 16, locationId: 'monster-market', startMinute: 10 * 60, endMinute: 20 * 60,
    participantIds: ['sera', 'mira', 'qiluo', 'daifu', 'freya'], description: '林铃花盛开时，共生所举行只使用自然落花的花会。',
    activities: [eventActivity('forest-gather', '落花采集', '辨认并收集自然掉落的五色林铃花。', 10 * 60, 13 * 60), eventActivity('forest-feed', '花香饲料工坊', '绮萝指导调配限定花香饲料。', 14 * 60, 17 * 60), eventActivity('forest-dance', '共生巡礼', '与牧场伙伴沿林下灯路缓步巡游。', 17 * 60, 20 * 60)],
  },
  {
    id: 'kite-messenger-festival', name: '风筝讯使节', month: 5, date: 12, locationId: 'mayor-home', startMinute: 9 * 60, endMinute: 18 * 60,
    participantIds: ['mina', 'loran', 'rin', 'taomi'], description: '弥奈把村民的远方书信系在风筝尾翼，让北风替它们启程。',
    activities: [eventActivity('kite-letter', '写给远方', '写一封不署收件人的风信。', 9 * 60, 11 * 60), eventActivity('kite-craft', '讯使风筝工坊', '用轻木与苔纸制作耐雾风筝。', 11 * 60, 14 * 60), eventActivity('kite-flight', '北坡放飞', '在凛划定的安全风线上同时放飞风筝。', 14 * 60, 18 * 60)],
  },
  {
    id: 'long-day-fishing-festival', name: '长昼渔火祭', month: 6, date: 21, locationId: 'fisher-home', startMinute: 5 * 60, endMinute: 22 * 60,
    participantIds: ['chaoyin', 'xiye', 'liuan', 'sujin', 'mina'], description: '一年白昼最长的日子，码头从晨雾亮到夜潮。',
    activities: [eventActivity('long-day-catch', '长昼钓赛', '从第一道晨光开始记录鱼获。', 5 * 60, 12 * 60), eventActivity('long-day-market', '潮岸鱼市', '柳安主持当日鱼获的公开交换。', 12 * 60, 17 * 60), eventActivity('long-day-lanterns', '渔火船列', '夜幕后沿岸点亮安全渔火。', 18 * 60, 22 * 60)],
  },
  {
    id: 'star-river-festival', name: '星河许愿夜', month: 7, date: 7, locationId: 'witch-home', startMinute: 18 * 60, endMinute: 23 * 60,
    participantIds: ['daifu', 'mina', 'freya', 'qiluo'], description: '五曜药庐打开屋顶观星窗，记录一年最清晰的星河。',
    activities: [eventActivity('star-chart', '星图抄绘', '在黛芙指导下描摹五行星位。', 18 * 60, 20 * 60), eventActivity('star-riddle', '五曜谜题', '根据星光颜色解答五行相克谜题。', 20 * 60, 21 * 60 + 30), eventActivity('star-wish', '无声许愿', '将愿望封进不会燃烧的星砂瓶。', 21 * 60 + 30, 23 * 60)],
  },
  {
    id: 'moon-harvest-festival', name: '月穗丰收会', month: 8, date: 15, locationId: 'general-store', startMinute: 10 * 60, endMinute: 21 * 60,
    participantIds: ['liuan', 'taomi', 'freya', 'loran', 'yanque'], description: '风铃商行前摆满当季作物，村民交换收成与配方。',
    activities: [eventActivity('harvest-display', '丰收陈列', '提交最满意的一份作物参加展示。', 10 * 60, 13 * 60), eventActivity('harvest-auction', '月穗竞价', '桃弥主持稀有收成的公开竞价。', 14 * 60, 17 * 60), eventActivity('harvest-dance', '谷仓夜舞', '收市后在灯串下举行丰收舞会。', 18 * 60, 21 * 60)],
  },
  {
    id: 'feather-forge-festival', name: '羽火锻造祭', month: 9, date: 9, locationId: 'smithy', startMinute: 9 * 60, endMinute: 20 * 60,
    participantIds: ['yanque', 'rin', 'daifu', 'taomi'], description: '羽火熔炉开放观摩，展示矿石从原矿到工具的完整过程。',
    activities: [eventActivity('forge-sort', '矿石识别', '在不点火的情况下辨认矿脉与杂质。', 9 * 60, 12 * 60), eventActivity('forge-rhythm', '锻锤节拍', '跟随岩雀的节拍完成安全锻打。', 13 * 60, 16 * 60), eventActivity('forge-sparks', '羽火展演', '观看五行药剂与金属火花的受控演示。', 17 * 60, 20 * 60)],
  },
  {
    id: 'mist-parade-festival', name: '薄雾巡游', month: 10, date: 31, locationId: 'monster-market', startMinute: 17 * 60, endMinute: 23 * 60,
    participantIds: ['sera', 'mira', 'qiluo', 'mina', 'sujin'], description: '共生伙伴与村民戴上林叶面具，在安全灯路中穿过薄雾。',
    activities: [eventActivity('mist-mask', '林叶面具', '制作不会惊扰魔物伙伴的气味面具。', 17 * 60, 19 * 60), eventActivity('mist-parade', '共生巡游', '沿林下灯路完成夜间巡游。', 19 * 60, 21 * 60), eventActivity('mist-tales', '雾边故事会', '在篝灯旁交换没有恶意的怪谈。', 21 * 60, 23 * 60)],
  },
  {
    id: 'echo-lamp-festival', name: '回声矿灯祭', month: 11, date: 16, locationId: 'mine', startMinute: 8 * 60, endMinute: 18 * 60,
    participantIds: ['yanque', 'rin', 'loran', 'weina'], description: '矿工在安全电梯层检修灯具，也纪念未能归来的探索者。',
    activities: [eventActivity('echo-safety', '矿灯检修', '学习检查矿灯、绳结与紧急标记。', 8 * 60, 11 * 60), eventActivity('echo-hunt', '安全层寻矿', '在无怪电梯层进行限时矿脉观察。', 11 * 60, 15 * 60), eventActivity('echo-memory', '回声默灯', '在入口熄灯一分钟记录旧日姓名。', 16 * 60, 18 * 60)],
  },
  {
    id: 'snow-watch-festival', name: '守夜落雪宴', month: 12, date: 31, locationId: 'mayor-home', startMinute: 18 * 60, endMinute: 1440,
    participantIds: ['loran', 'freya', 'mina', 'liuan', 'taomi', 'yanque', 'sera', 'mira', 'qiluo', 'daifu', 'rin', 'chaoyin', 'xiye', 'weina', 'sujin'], description: '所有村民在壁炉议事厅回顾一年，并一起守候新年第一场雪。',
    activities: [eventActivity('snow-banquet', '百家冬宴', '每人带来一道与今年记忆有关的食物。', 18 * 60, 21 * 60), eventActivity('snow-memories', '年度回忆册', '挑选一段共同经历写入村庄档案。', 21 * 60, 22 * 60 + 30), eventActivity('snow-countdown', '落雪守夜', '在窗边安静守候跨年的钟声。', 22 * 60 + 30, 1440)],
  },
]

export function getFestivalOnDay(day: number): Festival | undefined {
  const calendar = getCalendarDate(1, day)
  return festivals.find((festival) => festival.month === calendar.month && festival.date === calendar.date)
}

export function getFestivalOffers(day: number, locationId: LocationId) {
  const festival = getFestivalOnDay(day)
  if (!festival || festival.locationId !== locationId) return []
  return FESTIVAL_SEED_OFFERS.filter((offer) => (
    offer.festivalId === festival.id && offer.locationId === locationId
  ))
}

const segment = (startMinute: number, endMinute: number, locationId: LocationId, activity: string): ScheduleSegment => ({ startMinute, endMinute, locationId, activity })

function createSchedule(
  npcId: string,
  home: LocationId,
  workStart: number,
  workEnd: number,
  workActivity: string,
  leisureEnd: number,
  leisureLocation: LocationId,
  leisureActivity: string,
  weeklyDay: number,
  weeklyLocation: LocationId,
  weeklyActivity: string,
): NpcDailySchedule {
  return {
    npcId,
    defaultSegments: [
      segment(0, workStart, home, '休息并准备一天'),
      segment(workStart, workEnd, home, workActivity),
      segment(workEnd, leisureEnd, leisureLocation, leisureActivity),
      segment(leisureEnd, 1440, home, '结束外出并休息'),
    ],
    weeklyOverrides: {
      [weeklyDay]: [
        segment(0, 8 * 60, home, '休息并准备一天'),
        segment(8 * 60, 12 * 60, home, '处理必要的例行事务'),
        segment(12 * 60, 18 * 60, weeklyLocation, weeklyActivity),
        segment(18 * 60, 1440, home, '结束外出并休息'),
      ],
    },
  }
}

export const npcSchedules: Record<string, NpcDailySchedule> = Object.fromEntries([
  createSchedule('loran', 'mayor-home', 8 * 60, 17 * 60, '处理村务与委托', 19 * 60, 'general-store', '巡视商街并听取近况', 1, 'library', '查阅村庄旧档'),
  createSchedule('freya', 'mayor-home', 6 * 60 + 30, 16 * 60, '照料草药园与伤员', 19 * 60, 'hospital', '协助草药照护', 2, 'farm', '记录南坡作物生长'),
  createSchedule('mina', 'mayor-home', 7 * 60, 15 * 60, '整理与投递村内信件', 19 * 60, 'general-store', '交换远方消息', 3, 'hunter-camp', '向北林哨站递信'),
  createSchedule('liuan', 'general-store', 9 * 60, 18 * 60, '整理货架并经营柜台', 21 * 60, 'library', '核对商路旧账', 2, 'farm', '查看当季作物行情'),
  createSchedule('taomi', 'general-store', 8 * 60, 18 * 60, '核算商行账目', 21 * 60, 'library', '查阅旧票据', 4, 'mayor-home', '整理村务收支'),
  createSchedule('yanque', 'smithy', 8 * 60, 19 * 60, '锻造并修理工具', 21 * 60, 'mine', '检验当日矿石', 1, 'hunter-camp', '保养猎人装备'),
  createSchedule('sera', 'monster-market', 9 * 60, 18 * 60, '管理共生契约与牧场', 21 * 60, 'mayor-home', '登记共生合同', 5, 'farm', '回访共生牧场环境'),
  createSchedule('mira', 'monster-market', 7 * 60, 18 * 60, '观察伙伴健康与育种', 20 * 60, 'hospital', '交流照护记录', 1, 'farm', '检查牧场脚印与围栏'),
  createSchedule('qiluo', 'monster-market', 8 * 60, 19 * 60, '调配并记录饲料配方', 21 * 60, 'general-store', '采购饲料原料', 3, 'farm', '采集新鲜草料'),
  createSchedule('daifu', 'witch-home', 12 * 60, 22 * 60, '炼制药剂并研究术式', 23 * 60, 'library', '抄录五行古籍', 4, 'mine', '观察地下五行流向'),
  createSchedule('rin', 'hunter-camp', 6 * 60, 17 * 60, '巡林并进行战斗训练', 20 * 60, 'mine', '检查矿洞魔物踪迹', 2, 'smithy', '维护武器与护具'),
  createSchedule('chaoyin', 'fisher-home', 5 * 60, 14 * 60, '观潮、出航并整理渔具', 19 * 60, 'mayor-home', '汇报潮汐与航路', 3, 'general-store', '交换当日鱼获'),
  createSchedule('xiye', 'fisher-home', 5 * 60, 12 * 60, '沿岸试钓并指导钓法', 16 * 60, 'library', '整理水声与鱼群笔记', 5, 'farm', '观察农场水渠'),
  createSchedule('weina', 'hospital', 7 * 60, 17 * 60, '接诊并整理药物', 21 * 60, 'library', '阅读医疗档案', 3, 'mayor-home', '进行村民健康会诊'),
  createSchedule('sujin', 'hospital', 6 * 60, 18 * 60, '护理病人并制作热敷草包', 20 * 60, 'general-store', '采购护理用品', 4, 'farm', '采集舒缓草叶'),
].map((schedule) => [schedule.npcId, schedule]))

export function getNpcSchedule(npcId: string, year: number, day: number): ScheduleSegment[] {
  const schedule = npcSchedules[npcId]
  if (!schedule) return []
  return schedule.weeklyOverrides?.[getWeekdayIndex(year, day)] ?? schedule.defaultSegments
}

export function getNpcScheduleForDay(npcId: string, year: number, day: number): ScheduleSegment[] {
  const schedule = getNpcSchedule(npcId, year, day)
  const festival = getFestivalOnDay(day)
  if (!festival?.participantIds.includes(npcId)) return schedule

  const beforeAndAfter = schedule.flatMap((item) => {
    if (item.endMinute <= festival.startMinute || item.startMinute >= festival.endMinute) return [item]
    const fragments: ScheduleSegment[] = []
    if (item.startMinute < festival.startMinute) fragments.push({ ...item, endMinute: festival.startMinute })
    if (item.endMinute > festival.endMinute) fragments.push({ ...item, startMinute: festival.endMinute })
    return fragments
  })
  return [...beforeAndAfter, {
    startMinute: festival.startMinute,
    endMinute: festival.endMinute,
    locationId: festival.locationId,
    activity: festival.participantIds[0] === npcId ? `主持${festival.name}` : `参加${festival.name}`,
  }].sort((left, right) => left.startMinute - right.startMinute)
}

export function getNpcPresence(npcId: string, year: number, day: number, minutes: number): NpcPresence {
  const safeMinutes = clampInteger(minutes, 0, 1439)
  const festival = getFestivalOnDay(day)
  if (festival && safeMinutes >= festival.startMinute && safeMinutes < festival.endMinute && festival.participantIds.includes(npcId)) {
    return {
      npcId,
      startMinute: festival.startMinute,
      endMinute: festival.endMinute,
      locationId: festival.locationId,
      activity: festival.participantIds[0] === npcId ? `主持${festival.name}` : `参加${festival.name}`,
      festivalId: festival.id,
    }
  }
  const schedule = getNpcScheduleForDay(npcId, year, day)
  const current = schedule.find((item) => safeMinutes >= item.startMinute && safeMinutes < item.endMinute)
    ?? schedule.at(-1)
  if (!current) throw new Error(`角色 ${npcId} 缺少可用行程。`)
  return { npcId, ...current }
}

export function getNpcsAtLocation(locationId: LocationId, year: number, day: number, minutes: number) {
  return npcs.filter((npc) => getNpcPresence(npc.id, year, day, minutes).locationId === locationId)
}

export function isNpcBirthday(npcId: string, day: number): boolean {
  const npc = npcs.find((candidate) => candidate.id === npcId)
  if (!npc) return false
  return getDayOfYear(npc.birthday.month, npc.birthday.day) === clampInteger(day, 1, 365)
}

export function formatClock(minutes: number): string {
  const safeMinutes = clampInteger(minutes, 0, 1439)
  return `${String(Math.floor(safeMinutes / 60)).padStart(2, '0')}:${String(safeMinutes % 60).padStart(2, '0')}`
}
