package app.pochical.kit

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * How many of the person's days note each of 一緒に働く人, by id, as 設定 › 一緒に働く人 counts them; again
 * whenever the days change. Someone on no day is not in it.
 */
fun Values.coworkerDays(): Flow<Map<String, Int>> =
  days().map { days ->
    days.flatMap { day -> day.people?.split(" ").orEmpty().filter { it.isNotEmpty() }.distinct() }.groupingBy { it }.eachCount()
  }
