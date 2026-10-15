# SIOS Agents: the pet team (A4), the preview's Team app
# (TeamApp.tsx) on the real broker and brain. Looking needs no password (D59);
# every change is the owner's (password).
cmake_minimum_required(VERSION 3.22)
project(sios-agents VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.6 REQUIRED COMPONENTS Core Gui Quick Qml QuickControls2 Svg Network DBus)

qt_standard_project_setup(REQUIRES 6.6)

qt_add_executable(sios-agents src/main.cpp src/broker.cpp src/broker.h)

set_source_files_properties(src/qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
file(GLOB SIOS_AGENTS_QML RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/qml/*.qml)
foreach(f ${SIOS_AGENTS_QML})
    get_filename_component(name ${f} NAME)
    set_source_files_properties(${f} PROPERTIES QT_RESOURCE_ALIAS ${name})
endforeach()
file(GLOB SIOS_AGENTS_ICONS RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/icons/*.svg)

# QML is compiled into the binary, so a broken file fails the build, not the app
qt_add_qml_module(sios-agents
    URI org.sios.agents
    VERSION 1.0
    QML_FILES ${SIOS_AGENTS_QML}
    RESOURCES ${SIOS_AGENTS_ICONS}
)

target_link_libraries(sios-agents PRIVATE Qt6::Core Qt6::Gui Qt6::Quick Qt6::Qml Qt6::QuickControls2 Qt6::Svg Qt6::Network Qt6::DBus)

install(TARGETS sios-agents RUNTIME DESTINATION bin)
install(FILES org.sios.agents.desktop DESTINATION share/applications)
