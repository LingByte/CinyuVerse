import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

export interface EntityLinkSpec {
  text: string
  kind: 'character' | 'glossary'
  id: string
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRanges(text: string, entities: EntityLinkSpec[]) {
  const sorted = [...entities]
    .filter((e) => e.text.trim().length >= 2)
    .sort((a, b) => b.text.length - a.text.length)

  const occupied: Array<[number, number]> = []
  const hits: Array<{ from: number; to: number; entity: EntityLinkSpec }> = []

  for (const entity of sorted) {
    const re = new RegExp(escapeRegExp(entity.text), 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const from = m.index
      const to = from + entity.text.length
      const overlap = occupied.some(([a, b]) => !(to <= a || from >= b))
      if (overlap) continue
      occupied.push([from, to])
      hits.push({ from, to, entity })
    }
  }

  return hits.sort((a, b) => a.from - b.from)
}

export function entityLinkExtension(
  getEntities: () => EntityLinkSpec[],
  onEntityClick: (entity: EntityLinkSpec) => void,
) {
  const clickHandler = EditorView.domEventHandlers({
    click(event, _view) {
      const target = event.target as HTMLElement | null
      const el = target?.closest?.('[data-entity-kind]') as HTMLElement | null
      if (!el) return false
      const kind = el.dataset.entityKind as 'character' | 'glossary'
      const id = el.dataset.entityId ?? ''
      const text = el.textContent ?? ''
      if (!id) return false
      onEntityClick({ kind, id, text })
      return true
    },
  })

  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = this.build(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view)
        }
      }

      build(view: EditorView) {
        const entities = getEntities()
        if (!entities.length) return Decoration.none
        const doc = view.state.doc.toString()
        const builder = new RangeSetBuilder<Decoration>()
        for (const hit of buildRanges(doc, entities)) {
          const cls =
            hit.entity.kind === 'character' ? 'cm-entity-character' : 'cm-entity-glossary'
          builder.add(
            hit.from,
            hit.to,
            Decoration.mark({
              class: cls,
              attributes: {
                'data-entity-kind': hit.entity.kind,
                'data-entity-id': hit.entity.id,
              },
            }),
          )
        }
        return builder.finish()
      }
    },
    { decorations: (v) => v.decorations },
  )

  return [plugin, clickHandler]
}
