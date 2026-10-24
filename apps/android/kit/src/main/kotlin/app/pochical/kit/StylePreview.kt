package app.pochical.kit

import java.time.LocalDate

// The style pages' preview (spec/vectors/style-preview.json), as iOS's StylePreview.swift and
// /design's stylePreviewOf: a made-up run of the person's own patterns, the same whatever they
// have entered, so a change of style shows in the same places every time.

/**
 * Each working pattern with what follows it, like 明け after 夜勤, and the first day off after every
 * second one and after those followed, ending on that day off.
 */
fun sampleSequence(patterns: List<PatternRow>): List<String> {
  val ids = patterns.mapTo(HashSet()) { it.id }
  val followers = patterns.mapNotNullTo(HashSet()) { it.nextDay }
  val off = patterns.firstOrNull { it.countsAsOff }?.id
  val working = patterns.filter { !it.countsAsOff && it.id !in followers }
  val sequence = mutableListOf<String>()
  working.forEachIndexed { index, pattern ->
    sequence += pattern.id
    pattern.nextDay?.takeIf { it in ids }?.let { sequence += it }
    if (off != null && (index % 2 == 1 || pattern.nextDay != null)) sequence += off
  }
  if (off != null && sequence.lastOrNull() != off) sequence += off
  return sequence
}

/** The run over [days], one pattern a day; nothing without a run. Just shifts and days off: 早出, 残業 or a memo would mean nothing there. */
fun stylePreviewDays(days: List<LocalDate>, patterns: List<PatternRow>): Map<LocalDate, String> {
  val sequence = sampleSequence(patterns)
  if (sequence.isEmpty()) return emptyMap()
  return days.withIndex().associate { (index, day) -> day to sequence[index % sequence.size] }
}

/** The marks the テーマ and シフトの色 choices show side by side: the run's patterns each once, the first four. */
fun styleSamples(patterns: List<PatternRow>): List<String> = sampleSequence(patterns).distinct().take(4)
