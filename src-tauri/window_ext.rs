// src-tauri/src/window_ext.rs
use tauri::{Runtime, Window};

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSWindow, NSWindowStyleMask, NSWindowTitleVisibility};

pub trait WindowExt {
    #[cfg(target_os = "macos")]
    fn set_transparent_titlebar(&self, transparent: bool);
}

impl<R: Runtime> WindowExt for Window<R> {
    #[cfg(target_os = "macos")]
    fn set_transparent_titlebar(&self, transparent: bool) {
        // SAFETY: This unsafe block is sound because:
        // 1. `ns_window()` returns a valid NSWindow pointer managed by Tauri's window system
        // 2. The window handle is guaranteed to be valid for the lifetime of this Window object
        // 3. All Cocoa API calls (styleMask, setStyleMask_, setTitleVisibility_,
        //    setTitlebarAppearsTransparent_) are standard NSWindow methods that are safe to call
        //    on a valid NSWindow pointer
        // 4. The style mask modifications follow Apple's documented API contracts
        unsafe {
            let id = self.ns_window().unwrap() as cocoa::base::id;

            let mut style_mask = id.styleMask();
            style_mask.set(
                NSWindowStyleMask::NSFullSizeContentViewWindowMask,
                transparent,
            );
            id.setStyleMask_(style_mask);

            id.setTitleVisibility_(if transparent {
                NSWindowTitleVisibility::NSWindowTitleHidden
            } else {
                NSWindowTitleVisibility::NSWindowTitleVisible
            });
            id.setTitlebarAppearsTransparent_(if transparent {
                cocoa::base::YES
            } else {
                cocoa::base::NO
            });
        }
    }
}
