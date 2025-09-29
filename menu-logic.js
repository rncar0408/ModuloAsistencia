
document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.querySelector('.MuiBox-root[data-sidebar-state]');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    const toggleSidebar = () => {
        if (!mainContainer) return;
        const currentState = mainContainer.getAttribute('data-sidebar-state');
        const newState = (currentState === 'expanded') ? 'collapsed' : 'expanded';
        mainContainer.setAttribute('data-sidebar-state', newState);
    };

    if (mainContainer && sidebarToggleBtn && sidebarCloseBtn && sidebarBackdrop) {
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
        sidebarCloseBtn.addEventListener('click', toggleSidebar);
        sidebarBackdrop.addEventListener('click', toggleSidebar);
    }

    const adjustSidebarState = () => {
        if (!mainContainer) return;
        const isMobile = window.innerWidth <= 900;
        mainContainer.setAttribute('data-sidebar-state', isMobile ? 'collapsed' : 'expanded');
    };

    adjustSidebarState();
    window.addEventListener('resize', adjustSidebarState);
});