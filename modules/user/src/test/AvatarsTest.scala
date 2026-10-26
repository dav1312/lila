package lila.user

import lila.core.user.Avatar

class AvatarsTest extends munit.FunSuite:

  test("default avatar is a complete svg with no unfilled placeholders"):
    val svg = Avatars.svg(Avatar())
    assert(svg.startsWith("<svg"))
    assert(svg.endsWith("</svg>"))
    assert(!svg.contains("{"))

  test("chosen colours are set as custom properties on the svg"):
    val avatar = Avatar(skin = 2, hairColor = 3)
    assert(Avatars.svg(avatar).contains(s"style=\"${Avatars.colourVars(avatar)}\""))
    assert(Avatars.colourVars(avatar).contains(Avatars.skinTones(2)))
    assert(Avatars.colourVars(avatar).contains(Avatars.hairColors(3)))

  test("every option of every part renders, alone and in the editor"):
    Avatars.parts.foreach: part =>
      (0 until part.options.size).foreach: i =>
        val avatar = part.set(Avatar(), i)
        assert(!Avatars.svg(avatar).contains("{"), s"${part.name} option $i left a placeholder")
        assert(
          !Avatars.svg(avatar, editable = true).contains("{"),
          s"${part.name} option $i left a placeholder"
        )
        assert(!Avatars.thumbnail(part, i).contains("{"), s"${part.name} option $i left a placeholder")

  test("the editor draws all options of a part but shows only the chosen one"):
    val svg = Avatars.svg(Avatar(eyes = 2), editable = true)
    assert(svg.contains("""<g data-part="eyes" data-option="2">"""))
    assert(svg.contains("""<g data-part="eyes" data-option="0" style="display:none">"""))

  test("out of range indexes fall back to the first option instead of failing"):
    assertEquals(Avatars.svg(Avatar(skin = 999, hair = -1)), Avatars.svg(Avatar()))

  test("each part reads back the value it sets"):
    Avatars.parts.foreach: part =>
      assertEquals(part.get(part.set(Avatar(), 1)), 1, part.name)
