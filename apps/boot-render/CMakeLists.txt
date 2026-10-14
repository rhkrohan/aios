# Dev tool, not part of the image: renders the boot screen's pictures from the
# login splash's own QML (Orb.qml), so the boot looks exactly like it.
cmake_minimum_required(VERSION 3.22)
project(boot-render LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
find_package(Qt6 6.6 REQUIRED COMPONENTS Gui Quick Qml)
qt_add_executable(boot-render main.cpp)
target_link_libraries(boot-render PRIVATE Qt6::Gui Qt6::Quick Qt6::Qml)
