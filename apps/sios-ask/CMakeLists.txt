# The SIOS Ask bar: the preview's CommandBar (build_concept_html/src/
# components/command/CommandBar.tsx) above the dock, opened by the orb or
# Ctrl+Space (or Meta+Space). Finds apps, settings, actions and files now; asks the assistant
# once brain-d runs on the machine (Stage B).
cmake_minimum_required(VERSION 3.22)
project(sios-ask VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.6 REQUIRED COMPONENTS Core Gui Widgets Quick Qml QuickControls2 Svg DBus Network)
find_package(KF6KIO REQUIRED)
find_package(KF6Service REQUIRED)
find_package(KF6Baloo REQUIRED)

qt_standard_project_setup(REQUIRES 6.6)

qt_add_executable(sios-ask src/main.cpp src/search.cpp src/search.h src/assistant.cpp src/assistant.h)

set_source_files_properties(src/qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
file(GLOB SIOS_ASK_QML RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/qml/*.qml)
foreach(f ${SIOS_ASK_QML})
    get_filename_component(name ${f} NAME)
    set_source_files_properties(${f} PROPERTIES QT_RESOURCE_ALIAS ${name})
endforeach()
file(GLOB SIOS_ASK_ICONS RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/icons/*.svg)

qt_add_qml_module(sios-ask
    URI org.sios.ask
    VERSION 1.0
    QML_FILES ${SIOS_ASK_QML}
    RESOURCES ${SIOS_ASK_ICONS}
)

target_link_libraries(sios-ask PRIVATE
    Qt6::Core Qt6::Gui Qt6::Widgets Qt6::Quick Qt6::Qml Qt6::QuickControls2 Qt6::Svg Qt6::DBus
    KF6::KIOCore KF6::KIOGui KF6::Service KF6::Baloo
 Qt6::Network)

install(TARGETS sios-ask RUNTIME DESTINATION bin)
install(FILES org.sios.ask.desktop DESTINATION share/applications)
install(FILES org.sios.ask.desktop DESTINATION share/kglobalaccel)
