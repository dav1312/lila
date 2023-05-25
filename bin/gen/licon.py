#!/usr/bin/env python3
import subprocess
import re
import textwrap
import os
import argparse
import tempfile

comment_preamble = """/*
 * This source is generated by bin/gen/licon.py. Run bin/licon.py after changing public/font/lichess.sfd
 *
 * Constant names and values are pulled from private use characters defined in the sfd file.
 *
 * Character names can be edited in fontforge's "glyph info" dialog, or by editing the StartChar: line that
 * begins each character chunk in lichess.sfd
 *
 * To make these characters visible in your editor, install the lichess.ttf font (which is also generated by
 * licon.py) and then add it to your editor's font list.
 *
 * You could google 'how to install fonts', but it is generally considered best practice to ping @1vader on
 * discord about these matters.
 */
"""

scala_preamble = comment_preamble + """
package lila.common

object licon:
  opaque type Icon = String
  object Icon extends OpaqueString[Icon]
"""

typescript_preamble = comment_preamble + '\n'


def main():
    parser = argparse.ArgumentParser(description='lichess.sfd helper')
    parser.add_argument('--check', action='store_true', help='report any embedded licon literals in your sources')
    parser.add_argument('--replace', action='store_true', help='replace embedded licon literals with `licon.<glyph-name>`')

    os.chdir(os.path.join(os.path.dirname(__file__),'../../public/font'))

    [codes, warnings] = parse_codes()

    gen_sources(codes)

    gen_fonts()

    if len(warnings) > 0:
        print('Warnings:\n  ' + '  '.join(warnings))

    print('Generated:\n  public/font/lichess.woff\n  public/font/lichess.woff2\n  public/font/lichess.ttf')
    print('  modules/common/src/main/Licon.scala\n  ui/common/src/licon.ts\n')

    args = parser.parse_args()
    if args.check or args.replace:
        os.chdir(os.path.join(os.path.dirname(__file__),'..'))
        find_replace_refs({chr(v): k for k, v in codes.items()}, args.replace)
    else:
        print('Note:')
        print('  bin/licon.py --check    # report any embedded licon literals in your sources')
        print('  bin/licon.py --replace  # replace embedded licon literals with `licon.<glyph-name>`')

    print("\nDon't forget to install lichess.ttf in your system & editor!\n")


def dash_camel(s):
    return ''.join([w.title() for w in s.split('-')])


def parse_codes():
    unnamed_re = re.compile(r'$|Uni[a-fA-F0-9]{4}')
    codes = {}
    warnings = []
    with open('lichess.sfd', 'r') as f:
        lines = f.readlines()
        name = None
        for line in lines:
            if line.startswith('StartChar:'):
                name = dash_camel(line.split(": ")[1].strip())
            elif line.startswith("Encoding:") and name is not None:
                code_point = int(line.split(" ")[1])
                if code_point >= 0xe000 and code_point <= 0xefff:
                    if unnamed_re.match(name):
                        warnings.append(f'Unnamed glyph "{name}" at code point {code_point}\n')
                        continue
                    codes[name] = code_point
    return [codes, warnings]


def gen_sources(codes):
    with_type = lambda name: f'{name}: Icon'
    longest = len(max(codes.keys(), key=lambda x: len(x))) + 6

    with open('../../modules/common/src/main/Licon.scala', 'w') as scala:
        scala.write(scala_preamble)
        with open('../../ui/common/src/licon.ts', 'w') as ts:
            ts.write(typescript_preamble)
            for name in codes:
                scala.write(f'  val {with_type(name).ljust(longest)} = "{chr(codes[name])}" // {codes[name]:x}\n')
                ts.write(f"export const {name} = '{chr(codes[name])}'; // {codes[name]:x}\n")


def gen_fonts():
    [f, name] = tempfile.mkstemp(suffix='.pe', dir='.')
    os.write(f, textwrap.dedent(f"""
        Open("lichess.sfd")
        Generate("lichess.woff")
        Generate("lichess.woff2")
        Generate("lichess.ttf")
        Quit()
    """).encode('utf-8'))
    subprocess.run(['fontforge', '-script', name])
    os.remove(name)


def find_replace_refs(names, do_replace):
    search_re = re.compile(u'([\'"]([\ue000-\uefff])[\'"])')
    search_cp_re = re.compile(r'([\'"]\\u(e[0-9a-f]{3})[\'"])', re.IGNORECASE)

    print('Replacing...' if do_replace else 'Checking...')

    sources = []

    for dir, _, files in os.walk('.'):
        sources.extend(
            [os.path.join(dir, f) for f in files if any(map(lambda e: f.endswith(e), ['.ts', '.scala', '.scss']))]
        )

    for source in filter(
        lambda f: not os.path.basename(f) in ['Licon.scala', 'licon.ts'] and f.find('node_modules') == -1,
        sources
    ):
        replace = do_replace and not source.endswith('.scss')
        text = ''
        with open(source, 'r') as f:
            text = f.read()
            for regex in [search_re, search_cp_re]:
                m = regex.search(text)
                while m is not None:
                    line = text[:m.start()].count('\n') + 1
                    report = f'  {source}:{line} '
                    ch = m.group(2) if m.group(2)[:1] != 'e' else chr(int(m.group(2),16))
                    if replace and ch in names:
                        sub = f'licon.{names[ch]}'
                        if m.group(1).startswith("'") and source.endswith('scala'):
                            sub += '.charAt(0)'
                        text = text[:m.start()] + sub + text[m.end():]
                        report += f'{m.group(1)} -> {sub}'
                    else:
                        report += (f'found {m.group(2)}')
                    print(report)
                    m = regex.search(text, m.end())
        if replace:
            with open(source, 'w') as f:
                f.write(text)

if __name__ == "__main__":
    main()