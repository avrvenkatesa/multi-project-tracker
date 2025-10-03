document.getElementById('helpSearch').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const cards = document.querySelectorAll('a.bg-white');
  
  cards.forEach(card => {
    const title = card.querySelector('h2').textContent.toLowerCase();
    const desc = card.querySelector('p').textContent.toLowerCase();
    
    if (title.includes(query) || desc.includes(query)) {
      card.style.display = 'block';
    } else {
      card.style.display = query ? 'none' : 'block';
    }
  });
});
