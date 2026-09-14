import { useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import zhCn from "@fullcalendar/core/locales/zh-cn";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { active, localDay, type Task } from "./domain";
import { taskOverlap } from "./planning";

export function Calendar({
  tasks,
  onEdit,
  onCreate,
  onMove,
}: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onCreate: (date: string, start?: string) => void;
  onMove: (
    t: Task,
    date: string,
    start: string,
    duration: number,
  ) => Promise<void>;
}) {
  const ref = useRef<FullCalendar>(null);
  const [view, setView] = useState("dayGridMonth"),
    [title, setTitle] = useState(""),
    [error, setError] = useState("");
  const events = active(tasks)
    .filter((t) => t.date)
    .map((t) => {
      const start = new Date(`${t.date}T${t.start || "00:00"}:00`);
      return {
        id: t.id,
        title: t.title,
        start,
        allDay: !t.start,
        end: t.start
          ? new Date(start.getTime() + t.duration * 60000)
          : undefined,
        classNames: [
          t.done ? "calendar-done" : "",
          taskOverlap(t, tasks).length ? "calendar-overlap" : "",
        ],
        extendedProps: { task: t },
      };
    });
  return (
    <section className="calendar-panel panel">
      <div className="calendar-toolbar">
        <div className="inline-actions">
          <button
            className="icon-btn"
            aria-label="日历上一页"
            onClick={() => ref.current?.getApi().prev()}
          >
            <ChevronLeft size={18} />
          </button>
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="日历下一页"
            onClick={() => ref.current?.getApi().next()}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="text-button"
            onClick={() => ref.current?.getApi().today()}
          >
            今天
          </button>
        </div>
        <div className="segmented">
          {[
            ["dayGridMonth", "月"],
            ["timeGridWeek", "周"],
            ["timeGridDay", "日"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={view === v ? "selected" : ""}
              onClick={() => {
                setView(v);
                ref.current?.getApi().changeView(v);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        点击空白时段添加；拖动调整安排，拖动底边调整时长。手机长按拖动。橙色边框表示时间重叠。
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locale={zhCn}
        initialView="dayGridMonth"
        headerToolbar={false}
        firstDay={1}
        height="auto"
        editable
        selectable
        selectMirror
        dayMaxEvents={3}
        nowIndicator
        eventOverlap
        slotEventOverlap={false}
        longPressDelay={400}
        eventLongPressDelay={400}
        selectLongPressDelay={400}
        allDayText="全天"
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        scrollTime="08:00:00"
        slotDuration="00:30:00"
        events={events}
        datesSet={(info) => setTitle(info.view.title)}
        dateClick={(info) =>
          onCreate(
            localDay(info.date),
            info.allDay
              ? ""
              : `${String(info.date.getHours()).padStart(2, "0")}:${String(info.date.getMinutes()).padStart(2, "0")}`,
          )
        }
        eventClick={(info) => onEdit(info.event.extendedProps.task as Task)}
        eventContent={(info) => (
          <span className="calendar-event-text">
            {info.event.extendedProps.task.done ? "✓ " : ""}
            {info.timeText && `${info.timeText} `}
            {info.event.title}
          </span>
        )}
        eventDrop={(info) => {
          const t = info.oldEvent.extendedProps.task as Task;
          const d = info.event.start!;
          const date = localDay(d),
            start = info.event.allDay
              ? ""
              : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          info.revert();
          void onMove(t, date, start, t.duration)
            .then(() => setError(""))
            .catch((e) => setError(e.message));
        }}
        eventResize={(info) => {
          const t = info.oldEvent.extendedProps.task as Task;
          const duration = Math.round(
            (info.event.end!.getTime() - info.event.start!.getTime()) / 60000,
          );
          info.revert();
          void onMove(t, t.date, t.start, duration)
            .then(() => setError(""))
            .catch((e) => setError(e.message));
        }}
      />
      <div className="section-title calendar-inbox">
        <h3>未安排任务</h3>
        <button className="text-button" onClick={() => onCreate("")}>
          <Plus size={14} /> 添加
        </button>
      </div>
      <div className="calendar-inbox-list">
        {active(tasks)
          .filter((t) => !t.date && !t.done)
          .map((t) => (
            <button className="secondary" key={t.id} onClick={() => onEdit(t)}>
              {t.title}
            </button>
          ))}
      </div>
    </section>
  );
}
