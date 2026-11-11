// Code generated from design/ by `mise run gen`. Do not edit.

package app.pochical.design

/** The drawings a person can use as their face in place of a photo, in the chooser's order (design/src/drawings.ts). */
data class FaceDrawing(
  val id: String,
  /** Its name, as a screen reader says it. */
  val name: String,
  /** The picture, an SVG among the raw resources: a square that scales to any size. */
  val picture: Int,
) {
  companion object {
    val all: List<FaceDrawing> = listOf(
      FaceDrawing("cat", "ねこ", R.raw.drawing_cat),
      FaceDrawing("dog", "いぬ", R.raw.drawing_dog),
      FaceDrawing("rabbit", "うさぎ", R.raw.drawing_rabbit),
      FaceDrawing("bear", "くま", R.raw.drawing_bear),
      FaceDrawing("penguin", "ペンギン", R.raw.drawing_penguin),
      FaceDrawing("chick", "ひよこ", R.raw.drawing_chick),
      FaceDrawing("coffee", "コーヒー", R.raw.drawing_coffee),
      FaceDrawing("onigiri", "おにぎり", R.raw.drawing_onigiri),
      FaceDrawing("strawberry", "いちご", R.raw.drawing_strawberry),
      FaceDrawing("flower", "花", R.raw.drawing_flower),
      FaceDrawing("cactus", "サボテン", R.raw.drawing_cactus),
      FaceDrawing("moon", "月", R.raw.drawing_moon),
    )
  }
}
