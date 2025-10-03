document.addEventListener('DOMContentLoaded', () => {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const hamburgerDropdown = document.getElementById('hamburger-dropdown');
  
  if (hamburgerBtn && hamburgerDropdown) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hamburgerDropdown.classList.toggle('hidden');
    });
    
    document.addEventListener('click', (e) => {
      if (!hamburgerBtn.contains(e.target) && !hamburgerDropdown.contains(e.target)) {
        hamburgerDropdown.classList.add('hidden');
      }
    });
    
    hamburgerDropdown.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburgerDropdown.classList.add('hidden');
      });
    });
  }
  
  const observer = new MutationObserver(() => {
    const userName = document.getElementById('userName')?.textContent;
    const userRole = document.getElementById('userRole')?.textContent;
    const userEmail = document.getElementById('userEmail')?.textContent;
    
    if (userName) {
      const mobileUserName = document.getElementById('mobile-userName');
      const mobileUserRole = document.getElementById('mobile-userRole');
      const mobileUserEmail = document.getElementById('mobile-userEmail');
      
      if (mobileUserName) mobileUserName.textContent = userName;
      if (mobileUserRole) mobileUserRole.textContent = userRole;
      if (mobileUserEmail) mobileUserEmail.textContent = userEmail;
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
});
