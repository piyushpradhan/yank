//! Read metadata and every representation from the same immutable Wayland offer.
use std::io::Read;
use wl_clipboard_rs::paste::{self, ClipboardType, Error, Seat};

pub enum Capture {
    Unsupported,
    Skip,
    Contents {
        text: Option<String>,
        image: Option<arboard::ImageData<'static>>,
    },
}

pub fn capture(skip_sensitive: bool) -> Capture {
    if std::env::var_os("WAYLAND_DISPLAY").is_none() {
        return Capture::Unsupported;
    }
    let snapshot = match paste::get_contents_snapshot(ClipboardType::Regular, Seat::Unspecified) {
        Ok(snapshot) => snapshot,
        // Match arboard's fallback when the compositor cannot provide data control.
        Err(
            Error::MissingProtocol { .. } | Error::WaylandConnection(_) | Error::SocketOpenError(_),
        ) => return Capture::Unsupported,
        Err(_) => return Capture::Skip,
    };
    let text = if let Some(mut pipe) = snapshot.text {
        let mut bytes = Vec::new();
        let result = if skip_sensitive {
            pipe.by_ref().take(1_048_577).read_to_end(&mut bytes)
        } else {
            pipe.read_to_end(&mut bytes)
        };
        if result.is_err() {
            return Capture::Skip;
        }
        let Ok(text) = String::from_utf8(bytes) else {
            return Capture::Skip;
        };
        if skip_sensitive && crate::sensitive::detect(&text).is_some() {
            return Capture::Skip;
        }
        Some(text)
    } else {
        None
    };
    let image = if let Some(mut pipe) = snapshot.image {
        let mut bytes = Vec::new();
        // Bound compressed bytes as well as decoded pixels.
        if pipe
            .by_ref()
            .take(200_000_001)
            .read_to_end(&mut bytes)
            .is_err()
            || bytes.len() > 200_000_000
        {
            return Capture::Skip;
        }
        let reader =
            image::ImageReader::with_format(std::io::Cursor::new(&bytes), image::ImageFormat::Png);
        let Ok((width, height)) = reader.into_dimensions() else {
            return Capture::Skip;
        };
        if u64::from(width) * u64::from(height) > 50_000_000 {
            return Capture::Skip;
        }
        let Ok(image) = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png) else {
            return Capture::Skip;
        };
        Some(arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: image.to_rgba8().into_raw().into(),
        })
    } else {
        None
    };
    Capture::Contents { text, image }
}
