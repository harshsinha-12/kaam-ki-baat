"""Kaam Ki Baat architecture explainer in Manim (Community Edition).

Render (needs `pip install manim`, plus ffmpeg and LaTeX, which this repo's CI doesn't provide):
    manim -qh scripts/manim/architecture.py Architecture -o kkb-architecture.mp4
    manim -qh --format=gif scripts/manim/architecture.py Escalation

Same colour system as the app (docs/design/colors.md).
"""
from manim import *

BG = "#0b0b0c"; INK = "#f2efe6"; MUTE = "#9a968c"
LEFT_C = "#7cc4ff"; CENTER_C = "#f5c451"; RIGHT_C = "#ff8a65"; OK = "#6fdc8c"; WARN = "#ff6b6b"
config.background_color = BG


def card(title, sub, color, w=3.1, h=1.05):
    box = RoundedRectangle(corner_radius=0.18, width=w, height=h, stroke_color=color, stroke_width=2, fill_color="#121211", fill_opacity=1)
    t = Text(title, font_size=24, color=INK, weight=BOLD).move_to(box.get_center() + UP * 0.17)
    s = Text(sub, font_size=15, color=MUTE).move_to(box.get_center() + DOWN * 0.22)
    return VGroup(box, t, s)


def agent(color):
    hexa = RegularPolygon(6, color=color, fill_color=color, fill_opacity=1).scale(0.32).rotate(PI / 6)
    eyes = VGroup(*[Ellipse(width=0.07, height=0.11, color=BG, fill_color=BG, fill_opacity=1).shift(x * RIGHT * 0.11) for x in (-1, 1)])
    return VGroup(hexa, eyes)


class Architecture(Scene):
    def construct(self):
        title = Text("Meeting mein bola. Repo mein bana?", font_size=36, color=INK).to_edge(UP, buff=0.4)
        self.play(Write(title), run_time=1.2)

        sources = VGroup(
            card("Wispr Flow", "approved meeting", "#b48cff"),
            card("GitHub", "SHA-pinned code", MUTE),
            card("Live app STT", "opt-in, provisional", LEFT_C),
        ).arrange(DOWN, buff=0.35).to_edge(LEFT, buff=0.5).shift(DOWN * 0.3)
        engine = card("Evidence engine", "rules · versions · read-back", OK, w=3.4, h=1.5).shift(DOWN * 0.3)
        zones = VGroup(
            card("Team Memory", "left · teammates", LEFT_C),
            card("Leader Desk", "front · passkey", CENTER_C),
            card("Code Navigator", "right · code graph", RIGHT_C),
        ).arrange(DOWN, buff=0.35).to_edge(RIGHT, buff=0.5).shift(DOWN * 0.3)

        self.play(LaggedStart(*[FadeIn(c, shift=RIGHT * 0.3) for c in sources], lag_ratio=0.25))
        flows_in = [Arrow(c.get_right(), engine.get_left(), buff=0.1, color=MUTE, stroke_width=2) for c in sources]
        self.play(LaggedStart(*[GrowArrow(a) for a in flows_in], lag_ratio=0.2), FadeIn(engine, scale=0.9))

        # packets of evidence travel into the engine
        dots = [Dot(color=c[0].get_color()).move_to(a.get_start()) for c, a in zip(sources, flows_in)]
        self.play(*[MoveAlongPath(d, Line(a.get_start(), a.get_end())) for d, a in zip(dots, flows_in)], run_time=1.2)
        self.play(*[FadeOut(d) for d in dots], Indicate(engine[0], color=OK))

        flows_out = [Arrow(engine.get_right(), z.get_left(), buff=0.1, color=z[0].get_color(), stroke_width=2) for z in zones]
        self.play(LaggedStart(*[GrowArrow(a) for a in flows_out], lag_ratio=0.2), LaggedStart(*[FadeIn(z, shift=LEFT * 0.3) for z in zones], lag_ratio=0.2))
        glyphs = VGroup(*[agent(z[0].get_color()).next_to(z, LEFT, buff=0.15).shift(UP * 0.38) for z in zones])
        self.play(LaggedStart(*[GrowFromCenter(g) for g in glyphs], lag_ratio=0.15))

        bolna = card("Bolna voice", "one persona · 5 HTTPS tools", INK, w=3.6).to_edge(DOWN, buff=0.25)
        self.play(FadeIn(bolna, shift=UP * 0.3), Create(DashedLine(engine.get_bottom(), bolna.get_top(), color=INK)))
        self.wait(1.5)


class Escalation(Scene):
    """Unknown answer → leader ticket → passkey approval → read-back → requester hears it."""
    def construct(self):
        steps = [("Harsh asks left", LEFT_C), ("Not confirmed", WARN), ("Charan approves", CENTER_C), ("Saved + read back", OK), ("Harsh hears it", LEFT_C)]
        nodes = VGroup(*[VGroup(Circle(0.42, color=c, fill_color=BG, fill_opacity=1), Text(str(i + 1), font_size=26, color=c)) for i, (_, c) in enumerate(steps)]).arrange(RIGHT, buff=1.4)
        labels = VGroup(*[Text(t, font_size=20, color=INK).next_to(n, DOWN, buff=0.3) for n, (t, _) in zip(nodes, steps)])
        line = Line(nodes[0].get_left(), nodes[-1].get_right(), color="#24231f").set_z_index(-1)
        self.play(Create(line), LaggedStart(*[FadeIn(n, scale=0.6) for n in nodes], lag_ratio=0.15))
        packet = Dot(color=INK, radius=0.09).move_to(nodes[0])
        self.add(packet)
        for i in range(len(nodes)):
            self.play(packet.animate.move_to(nodes[i]), Write(labels[i]), Indicate(nodes[i][0], color=steps[i][1]), run_time=0.9)
        quote = Text("“Freeze at 3:45, if CI is green.” — approved by Charan", font_size=24, color=CENTER_C).to_edge(UP, buff=0.8)
        self.play(FadeIn(quote, shift=DOWN * 0.2))
        self.wait(1.5)
