class Users:
    def __init__(self,name,password):
        self.name=name
        self.password=password
        self.borrowed_books=[]
    def show_borrowed_books(self):
        print(f"{self.name}'s borrowed books: ")
        if not self.borrowed_books:
            print("No books borrowed.")
            return
        else:
            for  i,book in enumerate(self.borrowed_books,start=1):
                print(f"{i}. {book.title} by {book.author}")
    def return_book(self,book):
        if book in self.borrowed_books:
            book.return_book()
            self.borrowed_books.remove(book)
        else:
            print("Book not borrowed!")
    def borrow_book(self,book):
        if book.available:
            book.borrow()
            self.borrowed_books.append(book)
            print("Borrowed book successfully.")
        else:
            print("Book is unavailable")
