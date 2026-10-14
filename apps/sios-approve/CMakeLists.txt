# SIOS Approve: the window that asks the owner when an AI wants to do
# something (D37). It shows what is waiting and sends the owner's answer to
# the broker; a yes also needs the owner's password (polkit, D39).
cmake_minimum_required(VERSION 3.22)
project(sios-approve VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.6 REQUIRED COMPONENTS Core Gui Quick Qml QuickControls2 Svg Network DBus)
qt_standard_project_setup(REQUIRES 6.6)

qt_add_executable(sios-approve src/main.cpp src/approvals.cpp src/approvals.h)

set_source_files_properties(src/qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
file(GLOB SIOS_APPROVE_QML RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/qml/*.qml)
foreach(f ${SIOS_APPROVE_QML})
    get_filename_component(name ${f} NAME)
    set_source_files_properties(${f} PROPERTIES QT_RESOURCE_ALIAS ${name})
endforeach()
file(GLOB SIOS_APPROVE_ICONS RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/icons/*.svg)

qt_add_qml_module(sios-approve
    URI org.sios.approve
    VERSION 1.0
    QML_FILES ${SIOS_APPROVE_QML}
    RESOURCES ${SIOS_APPROVE_ICONS}
)

target_link_libraries(sios-approve PRIVATE Qt6::Core Qt6::Gui Qt6::Quick Qt6::Qml Qt6::QuickControls2 Qt6::Svg Qt6::Network Qt6::DBus)

install(TARGETS sios-approve RUNTIME DESTINATION bin)
install(FILES org.sios.approve.desktop DESTINATION share/applications)
# started by the session bus when the broker has something waiting
install(FILES org.sios.Approve1.service DESTINATION share/dbus-1/services)
