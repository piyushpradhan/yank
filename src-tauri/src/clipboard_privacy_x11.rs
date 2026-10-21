// Yank's arboard backend uses X11 (including XWayland), not native Wayland offers.
use super::Snapshot;
use std::time::{Duration, Instant};
use x11rb::{
    connection::Connection,
    protocol::{
        xfixes::{ConnectionExt as _, SelectionEventMask},
        xproto::{Atom, AtomEnum, ConnectionExt as _, CreateWindowAux, Window, WindowClass},
        Event,
    },
    rust_connection::RustConnection,
    COPY_DEPTH_FROM_PARENT, CURRENT_TIME, NONE,
};

type Error = Box<dyn std::error::Error>;

pub struct Inspector {
    conn: RustConnection,
    window: Window,
    clipboard: Atom,
    targets: Atom,
    property: Atom,
    secret: Atom,
    generation: u64,
}

impl Inspector {
    pub fn new() -> Result<Self, ()> {
        Self::connect().map_err(|_| ())
    }

    fn connect() -> Result<Self, Error> {
        let (conn, screen) = x11rb::connect(None)?;
        conn.xfixes_query_version(5, 0)?.reply()?;
        let window = conn.generate_id()?;
        conn.create_window(
            COPY_DEPTH_FROM_PARENT,
            window,
            conn.setup().roots[screen].root,
            0,
            0,
            1,
            1,
            0,
            WindowClass::INPUT_OUTPUT,
            0,
            &CreateWindowAux::new(),
        )?
        .check()?;
        let atom = |name: &[u8]| -> Result<Atom, Error> {
            Ok(conn.intern_atom(false, name)?.reply()?.atom)
        };
        let clipboard = atom(b"CLIPBOARD")?;
        let targets = atom(b"TARGETS")?;
        let property = atom(b"YANK_PRIVACY_TARGETS")?;
        let secret = atom(b"x-kde-passwordManagerHint")?;
        conn.xfixes_select_selection_input(
            window,
            clipboard,
            SelectionEventMask::SET_SELECTION_OWNER
                | SelectionEventMask::SELECTION_WINDOW_DESTROY
                | SelectionEventMask::SELECTION_CLIENT_CLOSE,
        )?
        .check()?;
        conn.flush()?;
        Ok(Self {
            conn,
            window,
            clipboard,
            targets,
            property,
            secret,
            generation: 0,
        })
    }

    pub fn snapshot(&mut self) -> Result<Snapshot, ()> {
        self.inspect().map_err(|_| ())
    }

    fn inspect(&mut self) -> Result<Snapshot, Error> {
        self.drain()?;
        let generation = self.generation;
        let owner = self
            .conn
            .get_selection_owner(self.clipboard)?
            .reply()?
            .owner;
        if owner == NONE {
            self.drain()?;
            if self.generation != generation {
                return Err("selection changed".into());
            }
            return Ok(Snapshot {
                generation,
                marked: false,
            });
        }
        self.conn
            .convert_selection(
                self.window,
                self.clipboard,
                self.targets,
                self.property,
                CURRENT_TIME,
            )?
            .check()?;
        self.conn.flush()?;
        let deadline = Instant::now() + Duration::from_millis(150);
        let marked = loop {
            if Instant::now() >= deadline {
                return Err("selection inspection timed out".into());
            }
            match self.conn.poll_for_event()? {
                Some(Event::XfixesSelectionNotify(_)) => {
                    self.generation = self.generation.wrapping_add(1)
                }
                Some(Event::SelectionNotify(event))
                    if event.requestor == self.window
                        && event.selection == self.clipboard
                        && event.target == self.targets =>
                {
                    if event.property == NONE {
                        return Err("selection has no targets".into());
                    }
                    let reply = self
                        .conn
                        .get_property(true, self.window, self.property, AtomEnum::ATOM, 0, 1024)?
                        .reply()?;
                    if reply.bytes_after != 0 {
                        return Err("too many selection targets".into());
                    }
                    let mut values = reply.value32().ok_or("invalid selection targets")?;
                    // Presence alone is a conservative opt-out if a producer cannot serve the value.
                    break values.any(|a| a == self.secret);
                }
                Some(Event::Error(_)) => return Err("selection inspection failed".into()),
                Some(_) => {}
                None => std::thread::sleep(Duration::from_millis(2)),
            }
        };
        let after_owner = self
            .conn
            .get_selection_owner(self.clipboard)?
            .reply()?
            .owner;
        self.drain()?;
        if self.generation != generation || owner != after_owner {
            return Err("selection changed".into());
        }
        Ok(Snapshot { generation, marked })
    }

    fn drain(&mut self) -> Result<(), Error> {
        while let Some(event) = self.conn.poll_for_event()? {
            match event {
                Event::XfixesSelectionNotify(_) => {
                    self.generation = self.generation.wrapping_add(1)
                }
                Event::Error(_) => return Err("selection inspection failed".into()),
                _ => {}
            }
        }
        Ok(())
    }
}
