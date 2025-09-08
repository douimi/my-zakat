document.getElementById("select-all").addEventListener("change", function () {
    const checkboxes = document.querySelectorAll('input[name="submission_ids"]');
    checkboxes.forEach(checkbox => checkbox.checked = this.checked);
});
