import type { LocationId } from '../../game/types'

export interface VillageOpeningBeat {
  id: string
  speaker: 'narrator' | 'loran'
  text: string
  camera: 'overview' | 'location'
  focusLocationId?: LocationId
}

export const VILLAGE_OPENING_BEATS: readonly VillageOpeningBeat[] = [
  {
    id: 'village-awakens',
    speaker: 'narrator',
    text: '清晨的雾色沿着山坡缓缓散开，性撸谷的道路、屋顶与田野逐一映入眼帘。',
    camera: 'overview',
  },
  {
    id: 'loran-welcome',
    speaker: 'loran',
    text: '你就是 {{playerName}} 吧？欢迎来到性撸谷。我是这里的村长洛岚。正式开始生活前，让我带你认一认今后常走的路。',
    camera: 'overview',
  },
  {
    id: 'introduce-farm',
    speaker: 'loran',
    text: '先从脚下这片苔灯农场开始。这里是你的新家，也是播下第一粒种子、建立自己生活的地方。',
    camera: 'location',
    focusLocationId: 'farm',
  },
  {
    id: 'introduce-witch-home',
    speaker: 'loran',
    text: '西边林荫下是魔女之家。需要恢复药水、永久药剂或五行战斗道具时，可以去找黛芙。',
    camera: 'location',
    focusLocationId: 'witch-home',
  },
  {
    id: 'introduce-general-store',
    speaker: 'loran',
    text: '风铃响着的地方是杂货店。种子和常用材料能在那里买到，收获的农产品也可以交给柳安处理。',
    camera: 'location',
    focusLocationId: 'general-store',
  },
  {
    id: 'introduce-library',
    speaker: 'loran',
    text: '图书馆保存着村庄旧档与各类知识。若对这里的历史或某件事感到疑惑，书架往往会给你答案。',
    camera: 'location',
    focusLocationId: 'library',
  },
  {
    id: 'introduce-hospital',
    speaker: 'loran',
    text: '这是医院。受伤或身体不舒服时别硬撑，维娜和苏槿会照顾好你。',
    camera: 'location',
    focusLocationId: 'hospital',
  },
  {
    id: 'introduce-fisher-home',
    speaker: 'loran',
    text: '东南岸边住着渔家。想了解潮汐、鱼群和钓鱼技巧，就去听听潮音与汐夜的经验。',
    camera: 'location',
    focusLocationId: 'fisher-home',
  },
  {
    id: 'introduce-monster-market',
    speaker: 'loran',
    text: '林下共生所也叫魔物娘商店。塞拉她们会帮助你认识共生伙伴、牧场经营和合适的饲料。',
    camera: 'location',
    focusLocationId: 'monster-market',
  },
  {
    id: 'introduce-smithy',
    speaker: 'loran',
    text: '羽火升起的屋子是铁匠铺。工具升级、矿石精炼和装备修理，都少不了岩雀的手艺。',
    camera: 'location',
    focusLocationId: 'smithy',
  },
  {
    id: 'introduce-mayor-home',
    speaker: 'loran',
    text: '这里是村长家，也是壁炉议事厅。村民委托、季节会议和需要我协助的村务，都可以来这里谈。',
    camera: 'location',
    focusLocationId: 'mayor-home',
  },
  {
    id: 'introduce-hunter-camp',
    speaker: 'loran',
    text: '北林边缘是猎人帐篷。准备进入危险区域前，先向凛学习战斗和野外生存，会让旅途安全许多。',
    camera: 'location',
    focusLocationId: 'hunter-camp',
  },
  {
    id: 'introduce-mine',
    speaker: 'loran',
    text: '最后是矿洞。地下埋着珍贵矿石，也藏着真正的危险；带齐工具和补给，再决定走多深。',
    camera: 'location',
    focusLocationId: 'mine',
  },
  {
    id: 'loran-closing',
    speaker: 'loran',
    text: '路一开始总显得很多，但你很快会找到自己的节奏。这里的人，也会慢慢记住你的名字。',
    camera: 'overview',
  },
  {
    id: 'loran-farewell',
    speaker: 'loran',
    text: '那么，去看看属于你的性撸谷吧，{{playerName}}。愿你的第一天，从一件真心想做的事开始。',
    camera: 'overview',
  },
]

export function formatVillageOpeningText(text: string, playerName: string): string {
  return text.replaceAll('{{playerName}}', playerName)
}
