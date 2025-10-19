fn main() {
    {
        std::env::set_var("MACOSX_DEPLOYMENT_TARGET", "10.15");
        std::env::set_var("CMAKE_OSX_DEPLOYMENT_TARGET", "10.15");
    }

    tauri_build::build()
}
