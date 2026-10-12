# SIOS Monitor: how the computer is doing (CPU, memory, disk, network,
# battery, the apps using the most) and, with the assistant, its goals; in
# the preview's style (GoalsApp.tsx stat cards). Reads /proc and /sys.
cmake_minimum_required(VERSION 3.22)
project(sios-monitor VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.6 REQUIRED COMPONENTS Core Gui Widgets Quick Qml QuickControls2 Svg)
find_package(KF6CoreAddons REQUIRED)

qt_standard_project_setup(REQUIRES 6.6)

qt_add_executable(sios-monitor src/main.cpp src/sampler.cpp src/sampler.h)

# the QML lives in src/qml but belongs at the module's top level
set_source_files_properties(src/qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
file(GLOB SIOS_MONITOR_QML RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/qml/*.qml)
foreach(f ${SIOS_MONITOR_QML})
    get_filename_component(name ${f} NAME)
    set_source_files_properties(${f} PROPERTIES QT_RESOURCE_ALIAS ${name})
endforeach()
file(GLOB SIOS_MONITOR_ICONS RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/icons/*.svg)

# QML is compiled into the binary, so a broken file fails the build, not the app
qt_add_qml_module(sios-monitor
    URI org.sios.monitor
    VERSION 1.0
    QML_FILES ${SIOS_MONITOR_QML}
    RESOURCES ${SIOS_MONITOR_ICONS}
)

target_link_libraries(sios-monitor PRIVATE
    Qt6::Core Qt6::Gui Qt6::Widgets Qt6::Quick Qt6::Qml Qt6::QuickControls2 Qt6::Svg KF6::CoreAddons
)

install(TARGETS sios-monitor RUNTIME DESTINATION bin)
install(FILES org.sios.monitor.desktop DESTINATION share/applications)
