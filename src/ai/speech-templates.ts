/**
 * AI 发言模板句（tasks T021；规则 §5 策略表「白天发言」列）
 *
 * 纯函数、无随机、不 import 引擎任何模块：只吃「可见信息里的座位号」，
 * 吐出中文模板句。结构化声明（claim）由 decider 另行挂在 Action 上——
 * 村民/狼读 claim 字段做站边与投票，**不解析这里的自然语言**
 * （research D6）。
 */

/** 狼：伪装村民（无夜间信息、不点任何身份） */
export function wolfDisguiseVillager(): string {
  return '我就是个普通村民，没有夜间信息，先听大家说。';
}

/** 狼：被查杀反驳（规则 §5 原文「我不是狼，X 是悍跳」） */
export function wolfRebuttal(accuser: number): string {
  return `我不是狼，${accuser} 号是悍跳。他给我扣查杀没有任何依据，今天别跟着他走。`;
}

/** 预言家：跳身份 + 金水（最新查验结果为 good） */
export function seerClaimGood(target: number): string {
  return `我是预言家，昨晚验的 ${target} 号是好人（金水），今天跟他站一起。`;
}

/** 预言家：跳身份 + 查杀（最新查验结果为 werewolf） */
export function seerClaimWerewolf(target: number): string {
  return `我是预言家，昨晚验的 ${target} 号是狼（查杀），今天出他。`;
}

/** 村民：无任何预言家声明时的模板句（无信息，只表态） */
export function villagerNoInfo(): string {
  return '我是村民，没有夜间信息，今天先听预言家的。';
}

/** 村民：站边跳出的预言家 */
export function villagerStandWithSeer(seerSeat: number): string {
  return `我站 ${seerSeat} 号预言家，他的查验我认，今天按他说的投。`;
}
