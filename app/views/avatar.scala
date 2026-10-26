package views.avatar

import play.api.data.Form

import lila.app.UiEnv.{ *, given }
import lila.core.user.Avatar
import lila.user.Avatars

def edit(form: Form[Avatar])(using Context, Me) =
  val current = form.value | Avatar()
  views.account.ui.AccountPage("Avatar", "avatar"):
    div(cls := "box box-pad")(
      h1(cls := "box__top")("Avatar"),
      standardFlash,
      postForm(
        cls := "form3 avatar-editor",
        action := routes.Account.avatarApply,
        style := Avatars.colourVars(current)
      )(
        div(cls := "avatar-editor__preview")(raw(Avatars.svg(current, editable = true))),
        Avatars.parts.map: part =>
          div(cls := "avatar-editor__part")(
            div(cls := "form-label")(part.label),
            div(cls := "avatar-editor__options")(
              part.options.indices.map: i =>
                label(cls := "avatar-editor__option", title := s"${part.label} ${i + 1}")(
                  input(tpe := "radio", name := part.name, value := i.toString)(
                    part.swatch.option(attr("data-color") := part.options(i)),
                    (part.get(current) == i).option(st.checked)
                  ),
                  if part.swatch then
                    span(cls := "avatar-editor__swatch", style := s"background:${part.options(i)}")
                  else if part.options(i).isEmpty then span(cls := "avatar-editor__none")("None")
                  else raw(Avatars.thumbnail(part, i))
                )
            )
          ),
        form3.action(form3.submit(trans.site.apply()))
      )
    )
