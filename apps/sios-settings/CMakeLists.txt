# SIOS Settings: the preview's Settings (SettingsApp.tsx): the assistant's
# sections (Stage B), Appearance, Wi-Fi, Updates and About on the real
# machine, and the rest of KDE's System Settings one click away.
cmake_minimum_required(VERSION 3.22)
project(sios-settings VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.6 REQUIRED COMPONENTS Core Gui Widgets Quick Qml QuickControls2 Svg Network)
find_package(KF6Config REQUIRED)
find_package(KF6CoreAddons REQUIRED)

qt_standard_project_setup(REQUIRES 6.6)

qt_add_executable(sios-settings src/main.cpp src/system.cpp src/system.h src/broker.cpp src/broker.h)

# the QML lives in src/qml but belongs at the module's top level
set_source_files_properties(src/qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
file(GLOB SIOS_SETTINGS_QML RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/qml/*.qml)
foreach(f ${SIOS_SETTINGS_QML})
    get_filename_component(name ${f} NAME)
    set_source_files_properties(${f} PROPERTIES QT_RESOURCE_ALIAS ${name})
endforeach()
file(GLOB SIOS_SETTINGS_ICONS RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/icons/*.svg)

# QML is compiled into the binary, so a broken file fails the build, not the app
qt_add_qml_module(sios-settings
    URI org.sios.settings
    VERSION 1.0
    QML_FILES ${SIOS_SETTINGS_QML}
    RESOURCES ${SIOS_SETTINGS_ICONS}
)

target_link_libraries(sios-settings PRIVATE
    Qt6::Core Qt6::Gui Qt6::Widgets Qt6::Quick Qt6::Qml Qt6::QuickControls2 Qt6::Svg Qt6::Network KF6::ConfigCore KF6::CoreAddons
)

install(TARGETS sios-settings RUNTIME DESTINATION bin)
install(FILES org.sios.settings.desktop DESTINATION share/applications)
