# SIOS Files: the preview's Files app (build_concept_html/src/components/apps/
# FilesApp.tsx) as a native Qt app. C++ does the file work through KDE's KIO
# (copy, move, trash with undo, rename, open, thumbnails); QML draws it.
cmake_minimum_required(VERSION 3.22)
project(sios-files VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.6 REQUIRED COMPONENTS Core Gui Widgets Quick Qml QuickControls2 Svg)
find_package(KF6KIO REQUIRED)
find_package(KF6CoreAddons REQUIRED)

qt_standard_project_setup(REQUIRES 6.6)

qt_add_executable(sios-files
    src/main.cpp
    src/foldermodel.cpp src/foldermodel.h
    src/fileops.cpp src/fileops.h
    src/thumbnails.cpp src/thumbnails.h
)

# QML is compiled into the binary, so a broken file fails the build, not the app
# Theme holds the preview's design tokens, shared by every QML file
set_source_files_properties(src/qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
# the QML lives in src/qml but belongs at the module's top level, so the files
# see each other (and the Theme singleton) as one module
file(GLOB SIOS_FILES_QML RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/qml/*.qml)
foreach(f ${SIOS_FILES_QML})
    get_filename_component(name ${f} NAME)
    set_source_files_properties(${f} PROPERTIES QT_RESOURCE_ALIAS ${name})
endforeach()

qt_add_qml_module(sios-files
    URI org.sios.files
    VERSION 1.0
    QML_FILES
        src/qml/Main.qml
        src/qml/Theme.qml
        src/qml/Sidebar.qml
        src/qml/Toolbar.qml
        src/qml/ItemGrid.qml
        src/qml/ItemList.qml
        src/qml/Disc.qml
        src/qml/FileIcon.qml
        src/qml/Inspector.qml
        src/qml/QuickLook.qml
        src/qml/Toast.qml
        src/qml/Icon.qml
        src/qml/Menu.qml
        src/qml/MenuItem.qml
        src/qml/MenuSeparator.qml
    RESOURCES
        src/icons/arrow-left.svg src/icons/arrow-right.svg src/icons/chevron-right.svg
        src/icons/search.svg src/icons/arrow-up-down.svg src/icons/layout-grid.svg src/icons/list.svg
        src/icons/folder-plus.svg src/icons/panel-right.svg src/icons/x.svg
        src/icons/house.svg src/icons/file-text.svg src/icons/download.svg src/icons/code-xml.svg
        src/icons/image.svg src/icons/clock.svg src/icons/globe.svg src/icons/trash-2.svg
        src/icons/git-branch.svg src/icons/sparkles.svg src/icons/lock.svg src/icons/folder.svg
)

target_link_libraries(sios-files PRIVATE
    Qt6::Core Qt6::Gui Qt6::Widgets Qt6::Quick Qt6::Qml Qt6::QuickControls2 Qt6::Svg
    KF6::KIOCore KF6::KIOGui KF6::KIOWidgets KF6::CoreAddons
)

install(TARGETS sios-files RUNTIME DESTINATION bin)
install(FILES org.sios.files.desktop DESTINATION share/applications)
