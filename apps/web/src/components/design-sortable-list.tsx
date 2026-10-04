import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Announcements, DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Fragment, useId } from "react";
import type { ReactNode } from "react";
import { css, cx } from "styled-system/css";

import { listRow, listStyle } from "./design-list";

// A list put in order by dragging, kept apart so only the screens that
// sort carry dnd-kit.

// A list to reorder by its handles, as SwiftUI's List with .onMove: drag
// a handle, or focus it and use the arrow keys, with each move said to a
// screen reader. dnd kit does the dragging.
export function SortableList<Item extends { id: string }>({
  items,
  label,
  onChange,
  children,
  divider,
}: {
  items: Item[];
  // What the handle and the announcements call the row.
  label: (item: Item) => string;
  onChange: (items: Item[]) => void;
  // The row's content, before the handle.
  children: (item: Item) => ReactNode;
  // A ListDivider to go before the row at this place, if any.
  divider?: (index: number) => ReactNode;
}) {
  // dnd kit numbers its screen reader notes itself, which counts apart on
  // the server and in the browser; React's id is the same on both.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const nameOf = (id: string | number) =>
    label(items.find((item) => item.id === id) ?? items[0]);
  const place = (id: string | number | undefined) =>
    items.findIndex((item) => item.id === id) + 1;
  const announcements: Announcements = {
    onDragCancel: ({ active }) => `${nameOf(active.id)}を元の場所に戻しました`,
    onDragEnd: ({ active, over }) =>
      `${nameOf(active.id)}を${place(over?.id)}番目に置きました`,
    onDragOver: ({ active, over }) =>
      `${nameOf(active.id)}は${place(over?.id)}番目です`,
    onDragStart: ({ active }) => `${nameOf(active.id)}を持ち上げました`,
  };
  const end = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    onChange(arrayMove(items, from, to));
  };
  return (
    <DndContext
      id={dndId}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "スペースキーで持ち上げ、上下の矢印キーで動かし、もう一度スペースキーで置きます。Escで取り消します。",
        },
      }}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={end}
      sensors={sensors}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className={listStyle}>
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {divider?.(index)}
              <SortableRow id={item.id} label={label(item)}>
                {children(item)}
              </SortableRow>
            </Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

const sortable = {
  dragging: css({
    bg: "fill.quaternary",
    boxShadow: "md",
    position: "relative",
    zIndex: 1,
  }),
  handle: css({
    _focusVisible: {
      outline: "2px solid token(colors.accent.default)",
      outlineOffset: "-2px",
    },
    bg: "transparent",
    border: 0,
    color: "text.quaternary",
    cursor: "grab",
    display: "grid",
    height: "action",
    marginLeft: "auto",
    marginRight: "-8px",
    placeItems: "center",
    touchAction: "none",
    width: "36px",
  }),
};

function SortableRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });
  return (
    <div
      className={cx(listRow.root, isDragging && sortable.dragging)}
      data-list-row=""
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children}
      <button
        {...attributes}
        {...listeners}
        aria-label={`${label}を並べ替え`}
        className={sortable.handle}
        // Dragging it moves the row, not a sheet the list is in.
        data-no-drag=""
        ref={setActivatorNodeRef}
        type="button"
      >
        <GripVertical aria-hidden="true" size={18} />
      </button>
    </div>
  );
}
