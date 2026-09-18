cmake_minimum_required(VERSION 3.22)
project(pixelblur_controller LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if (NOT ANDROID)
    message(FATAL_ERROR "Build this project with the Android NDK CMake toolchain")
endif()

add_library(pixelblur SHARED src/zygisk_module.cpp)

target_include_directories(
    pixelblur PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party
)

target_compile_definitions(pixelblur PRIVATE _GNU_SOURCE)
target_compile_options(
    pixelblur PRIVATE
    -fvisibility=hidden
    -fno-exceptions
    -fno-rtti
    -ffunction-sections
    -fdata-sections
)
target_link_options(pixelblur PRIVATE -Wl,--gc-sections -Wl,--strip-all)
target_link_libraries(pixelblur PRIVATE log)
