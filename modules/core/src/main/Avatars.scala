package lila.core

import lila.core.user.Avatar

// A Mii-style face built from layered SVG pieces on a 120x120 canvas.
// Colours are CSS custom properties (--skin, --hair), so the editor can recolour its preview
// without re-rendering it.
object Avatars:

  val skinTones = Vector("#fde0c5", "#f1c27d", "#c68642", "#8d5524", "#4a2c17")

  val hairColors = Vector("#1c1410", "#5b3a1e", "#c9a24a", "#b5562a", "#9e9e9e", "#3a6fb0")

  // (drawn behind the face, svg)
  val hairStyles: Vector[(Boolean, String)] = Vector(
    (false, ""),
    (
      false,
      """<path d="M22 58C18 22 102 22 98 58C92 40 80 34 60 34C40 34 28 40 22 58Z" style="fill:var(--hair)"/>"""
    ),
    (
      true,
      """<path d="M18 72C6 16 114 16 102 72L104 106H90V56C80 38 40 38 30 56V106H16Z" style="fill:var(--hair)"/>"""
    ),
    (true, """<circle cx="60" cy="56" r="50" style="fill:var(--hair)"/>"""),
    (
      false,
      """<path d="M24 52L20 24L36 34L42 14L52 30L60 10L68 30L78 14L84 34L100 24L96 52C80 40 40 40 24 52Z" style="fill:var(--hair)"/>"""
    )
  )

  val eyebrows = Vector(
    "",
    """<path d="M38 45H54M66 45H82" fill="none" stroke-width="3.5" stroke-linecap="round" style="stroke:var(--hair)"/>""",
    """<path d="M38 47Q46 40 54 46M66 46Q74 40 82 47" fill="none" stroke-width="3.5" stroke-linecap="round" style="stroke:var(--hair)"/>""",
    """<path d="M38 39L54 46M66 46L82 39" fill="none" stroke-width="3.5" stroke-linecap="round" style="stroke:var(--hair)"/>"""
  )

  val eyes = Vector(
    """<circle cx="46" cy="58" r="3.5" fill="#2a2a2a"/><circle cx="74" cy="58" r="3.5" fill="#2a2a2a"/>""",
    """<ellipse cx="46" cy="58" rx="7" ry="8" fill="#fff"/><ellipse cx="74" cy="58" rx="7" ry="8" fill="#fff"/><circle cx="47" cy="59" r="4" fill="#2a2a2a"/><circle cx="75" cy="59" r="4" fill="#2a2a2a"/>""",
    """<path d="M38 58Q46 51 54 58Q46 63 38 58ZM66 58Q74 51 82 58Q74 63 66 58Z" fill="#2a2a2a"/>""",
    """<path d="M38 60Q46 52 54 60M66 60Q74 52 82 60" fill="none" stroke="#2a2a2a" stroke-width="3" stroke-linecap="round"/>""",
    """<circle cx="46" cy="58" r="3.5" fill="#2a2a2a"/><path d="M66 58Q74 51 82 58" fill="none" stroke="#2a2a2a" stroke-width="3" stroke-linecap="round"/>"""
  )

  val noses = Vector(
    "",
    """<path d="M60 60Q55 68 61 71" fill="none" stroke="#a0674a" stroke-width="2.5" stroke-linecap="round"/>""",
    """<circle cx="60" cy="68" r="3.5" fill="#a0674a"/>""",
    """<path d="M61 58L56 71H62" fill="none" stroke="#a0674a" stroke-width="2.5" stroke-linejoin="round"/>"""
  )

  val mouths = Vector(
    """<path d="M48 84Q60 96 72 84" fill="none" stroke="#8a3b3b" stroke-width="3" stroke-linecap="round"/>""",
    """<path d="M47 82Q60 98 73 82Z" fill="#8a3b3b"/>""",
    """<path d="M50 87H70" fill="none" stroke="#8a3b3b" stroke-width="3" stroke-linecap="round"/>""",
    """<ellipse cx="60" cy="87" rx="5" ry="6.5" fill="#8a3b3b"/>""",
    """<path d="M48 90Q60 80 72 90" fill="none" stroke="#8a3b3b" stroke-width="3" stroke-linecap="round"/>"""
  )

  val moustaches = Vector(
    "",
    """<path d="M47 79Q54 73 60 77Q66 73 73 79Q66 85 60 81Q54 85 47 79Z" style="fill:var(--hair)"/>""",
    """<path d="M42 80Q50 72 60 79Q70 72 78 80Q72 78 66 83Q60 80 54 83Q48 78 42 80Z" style="fill:var(--hair)"/>"""
  )

  val glasses = Vector(
    "",
    """<g fill="rgba(255,255,255,0.15)" stroke="#2a2a2a" stroke-width="2.5"><circle cx="46" cy="58" r="10"/><circle cx="74" cy="58" r="10"/><path d="M56 58H64" fill="none"/></g>""",
    """<g fill="rgba(255,255,255,0.15)" stroke="#2a2a2a" stroke-width="2.5"><rect x="36" y="50" width="20" height="16" rx="3"/><rect x="64" y="50" width="20" height="16" rx="3"/><path d="M56 56H64" fill="none"/></g>""",
    """<g stroke="#2a2a2a" stroke-width="2.5"><rect x="35" y="51" width="22" height="13" rx="4" fill="#1a1a1a"/><rect x="63" y="51" width="22" height="13" rx="4" fill="#1a1a1a"/><path d="M57 55H63" fill="none"/></g>"""
  )

  // The image URL of an avatar: its option indexes in part order, so the same avatar always has the same URL
  def url(a: Avatar): String = s"/avatar/${parts.map(_.get(a)).mkString("-")}.svg"

  // The inverse of url, for the image route. A malformed path gives the default avatar.
  def fromPath(path: String): Avatar =
    val indexes = path.stripSuffix(".svg").split('-').map(_.toIntOption.getOrElse(0)).toList
    if indexes.size != parts.size then Avatar()
    else
      parts
        .zip(indexes)
        .foldLeft(Avatar()): (a, pi) =>
          pi._1.set(a, pi._2)

  // One choice the user makes. Options are the svg pieces (or colours, for swatch parts),
  // viewBox crops a single option to just its own area in the editor.
  case class Part(
      name: String,
      label: String,
      options: Vector[String],
      get: Avatar => Int,
      set: (Avatar, Int) => Avatar,
      viewBox: String = "0 0 120 120",
      swatch: Boolean = false
  )

  val skinPart = Part("skin", "Skin", skinTones, _.skin, (a, i) => a.copy(skin = i), swatch = true)
  val hairPart =
    Part("hair", "Hair", hairStyles.map(_._2), _.hair, (a, i) => a.copy(hair = i), viewBox = "10 4 100 104")
  val hairColorPart =
    Part("hairColor", "Hair color", hairColors, _.hairColor, (a, i) => a.copy(hairColor = i), swatch = true)
  val eyebrowsPart = Part(
    "eyebrows",
    "Eyebrows",
    eyebrows,
    _.eyebrows,
    (a, i) => a.copy(eyebrows = i),
    viewBox = "28 30 64 24"
  )
  val eyesPart = Part("eyes", "Eyes", eyes, _.eyes, (a, i) => a.copy(eyes = i), viewBox = "30 40 60 36")
  val nosePart = Part("nose", "Nose", noses, _.nose, (a, i) => a.copy(nose = i), viewBox = "48 50 24 26")
  val mouthPart =
    Part("mouth", "Mouth", mouths, _.mouth, (a, i) => a.copy(mouth = i), viewBox = "38 74 44 28")
  val moustachePart = Part(
    "moustache",
    "Moustache",
    moustaches,
    _.moustache,
    (a, i) => a.copy(moustache = i),
    viewBox = "36 66 48 24"
  )
  val glassesPart =
    Part("glasses", "Glasses", glasses, _.glasses, (a, i) => a.copy(glasses = i), viewBox = "28 40 64 28")

  val parts: List[Part] = List(
    skinPart,
    hairPart,
    hairColorPart,
    eyebrowsPart,
    eyesPart,
    nosePart,
    mouthPart,
    moustachePart,
    glassesPart
  )

  // The colour custom properties for an avatar, used on the svg and on the editor form
  def colourVars(a: Avatar): String =
    s"--skin:${skinTones(index(skinPart, a.skin))};--hair:${hairColors(index(hairColorPart, a.hairColor))}"

  // Out of range indexes (e.g. from an old record) fall back to the first option
  private def index(part: Part, i: Int): Int =
    if part.options.indices.contains(i) then i else 0

  // The face. In editable mode every option of every part is drawn, and only the chosen one is
  // shown, so the editor can switch options by toggling display without re-rendering.
  def svg(a: Avatar, editable: Boolean = false): String =
    def chosen(part: Part): Int = index(part, part.get(a))
    val hairBehind = (i: Int) => hairStyles(i)._1
    def layer(part: Part, include: Int => Boolean = _ => true): String =
      val shown = chosen(part)
      val indexes =
        if editable then part.options.indices.filter(include).toList
        else Option.when(include(shown))(shown).toList
      indexes
        .map: i =>
          val style = if editable && i != shown then """ style="display:none"""" else ""
          s"""<g data-part="${part.name}" data-option="$i"$style>${part.options(i)}</g>"""
        .mkString
    val colours = if editable then "" else s""" style="${colourVars(a)}""""
    val layers = List(
      layer(hairPart, hairBehind),
      """<ellipse cx="60" cy="62" rx="36" ry="42" style="fill:var(--skin)"/>""",
      layer(eyebrowsPart),
      layer(eyesPart),
      layer(nosePart),
      layer(mouthPart),
      layer(moustachePart),
      layer(glassesPart),
      layer(hairPart, i => !hairBehind(i))
    )
    s"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img"$colours>${layers.mkString}</svg>"""

  // One option drawn on its own, cropped to its part, for the editor's option buttons
  def thumbnail(part: Part, i: Int): String =
    s"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="${part.viewBox}">${part.options(i)}</svg>"""
